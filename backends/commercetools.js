// 3rd party libs
const URI = require('urijs');
const _ = require('lodash')
const axios = require('axios')

const { formatMoneyString } = require('../util/locale-formatter')
const CommerceBackend = require('./index')

const mapImage = image => image && ({ url: image.url })

const localize = (text, args) => {
    if (text.label) {
        text = text.label
    }

    if (typeof text === 'string') {
        return text
    }

    return text[args.locale] || text[args.language] || text[Object.keys(text)[0]]
}

const mapProduct = args => product => {
    return {
        ...product,
        name            : localize(product.name, args),
        slug            : localize(product.slug, args),
        longDescription : product.metaDescription && localize(product.metaDescription, args),
        variants        : _.map(_.concat(product.variants, [product.masterVariant]), variant => ({
            ...variant,
            prices      : { list: formatMoneyString(_.get(variant.scopedPrice || _.first(variant.prices), 'value.centAmount') / 100, args.locale, args.currency) },
            images      : _.map(variant.images, mapImage),
            defaultImage: mapImage(_.first(variant.images)),
            attributes  : _.map(variant.attributes, att => ({ name: att.name, value: localize(att.value, args) })),
            size        : _.get(_.find(variant.attributes, att => att.name === 'size'), 'value'),
            color       : _.get(_.find(variant.attributes, att => att.name === 'color'), `value.label.${args.locale}`)
        })),
        categories      : _.map(product.categories, cat => ({
            ...cat.obj,
            name: localize(cat.obj.name, args),
            slug: localize(cat.obj.slug, args)
        })),
        raw             : product
    }
}
class CommerceToolsBackend extends CommerceBackend {
    constructor(cred) {
        super(cred)
        this.configs = {
            products: {
                uri: `product-projections/search`,
                args: { expand: ['categories[*]'] },
                mapper: mapProduct
            },
            productsQuery: {
                uri: `product-projections`,
                args: { expand: ['categories[*]'] },
                mapper: mapProduct
            },
            categories: {
                uri: `categories`,
                args: { where: [`parent is not defined`] },
                mapper: args => async (category) => ({
                    ...category,
                    name        : localize(category.name, args),
                    slug        : localize(category.slug, args),
                    products    : (await this.get('productsQuery', { where: [`categories(id="${category.id}")`] })).results,
                    children    : (await this.get('categories', { where: [`parent(id="${category.id}")`] })).results,
                    raw         : category
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
            offset: args.offset,
            where: args.where
        }

        let [ language, country ] = args.locale.split('-')

        if (config.uri.indexOf('projections') > -1) {
            query.priceCurrency = args.currency
        }

        if (args.keyword) {
            query[`text.${language}`] = args.keyword
        }

        if (args.id) {
            query.filter = [`id:"${args.id}"`]
        }
        else if (args.slug) {
            query.filter = [`slug.${language}:"${args.slug}"`]
        }
        else if (args.sku) {
            query.filter = [`variants.sku:"${args.sku}")`]
        }

        // add any filters based on the args
        uri.addQuery(query)

        return uri        
    }

    async getHeaders() {
        return { authorization: await this.authenticate() }
    }

    async translateResults(data, mapper = (args => x => x)) {
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