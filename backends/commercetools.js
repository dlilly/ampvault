// 3rd party libs
const URI = require('urijs');
const _ = require('lodash')
const axios = require('axios')
const CommerceBackend = require('./index')

const mapImage = image => image && ({ url: image.url })

class CommerceToolsBackend extends CommerceBackend {
    constructor(cred) {
        super(cred)
        this.configs = {
            products: {
                uri: `product-projections/search`,
                args: { expand: ['categories[*]'] },
                mapper: product => ({
                    ...product,
                    variants    : _.map(_.concat(product.variants, [product.masterVariant]), variant => ({
                        ...variant,
                        prices      : { list: _.get(_.first(variant.prices), 'value.centAmount') / 100 },
                        images      : _.map(variant.images, mapImage),
                        defaultImage: mapImage(_.first(variant.images))
                    })),
                    categories  : _.map(product.categories, 'obj'),
                    raw: product
                })
            },
            categories: {
                uri: `categories`,
                mapper: async (category) => ({
                    ...category,
                    products: (await this.get('products', { where: [`categories(id="${category.id}")`] })).results,
                    children: _.isEmpty(category.ancestors) ? (await this.get('categories', { where: [`parent(id="${category.id}")`] })).results : [],
                    raw: category
                })
            }
        }

        this.accessToken = null
    }

    async authenticate() {
        if (!this.accessToken) {
            let response = await axios.post(
                `${this.cred.oauth_url}/oauth/token?grant_type=client_credentials&scope=${_.first(_.split(this.cred.scope, ' '))}`, {},
                {
                    auth: {
                        username: this.cred.client_id,
                        password: this.cred.client_secret
                    }
                }
            )
            console.log(`[ ct ] access token: ${response.data.access_token}`)
            this.accessToken = `${response.data.token_type} ${response.data.access_token}`
        }
        return this.accessToken
    }

    getRequestURL(config, args) {
        let uri = new URI(`${this.cred.api_url}/${this.cred.project}/${config.uri}`)

        let query = {
            limit: args.limit,
            offset: args.offset
        }

        if (args.keyword) {
            query[`text.${args.locale}`] = args.keyword
        }
        if (args.slug) {
            query.filter = [`slug.${args.locale}:"${args.slug}"`]
        }
        if (args.sku) {
            query.filter = [`variants.sku:"${args.sku}")`]
        }
        if (args.id) {
            query.filter = [`id:"${args.id}"`]
        }

        // add any filters based on the args
        uri.addQuery(query)

        return uri        
    }

    async getHeaders() {
        return { authorization: await this.authenticate() }
    }

    async translateResults(data, mapper = (x => x)) {
        if (!data.results) {
            data = {
                limit: 1,
                count: 1,
                total: 1,
                offset: 0,
                results: [data]
            }
        }

        return {
            meta: {
                total: data.total,
                count: data.count,
                limit: data.limit,
                offset: data.offset
            },
            results: await Promise.all(data.results.map(await mapper))
        }
    }
}

module.exports = CommerceToolsBackend