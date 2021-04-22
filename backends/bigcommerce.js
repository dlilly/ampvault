// 3rd party libs
const URI = require('urijs');
const _ = require('lodash')

const { formatMoneyString } = require('../util/locale-formatter')
const CommerceBackend = require('./index')

let mapImage = image => ({ url: image.url_standard })

let mapVariant = (prod, args) => variant => {
    let images = variant.image_url ? [{ url: variant.image_url }] : _.map(prod.images, mapImage)
    return {
        ...variant,
        prices: {
            list: formatMoneyString(variant.price || prod.price, args.locale, args.currency),
            sale: formatMoneyString(variant.sale_price || prod.price, args.locale, args.currency)
        },
        defaultImage: _.first(images),
        attributes: variant.option_values.map(opt => ({ name: opt.option_display_name.toLowerCase(), value: opt.label })),
        images
    }
}

class BigCommerceBackend extends CommerceBackend {
    constructor(cred) {
        super(cred)
        this.configs = {
            products: {
                uri: `products`,
                args: { include: 'images,variants' },
                mapper: args => async prod => ({
                    ...prod,
                    shortDescription: prod.description,
                    longDescription: prod.description,
                    variants: _.map(prod.variants, mapVariant(prod, args)),
                    categories: await Promise.all(prod.categories.map(async cat => await this.getOne('categories', { id: cat.id, single: true }))),
                    raw: prod
                })
            },
    
            categories: {
                uri: `categories`,
                mapper: args => async cat => ({
                    ...cat,
                    products: !args.single && (await this.get('products', { "categories:in": cat.id })).results,
                    children: !args.single && (await this.get('categories', { parent_id: cat.id })).results,
                    raw: cat
                })
            }
        }

        this.catalogApiUrl = `${this.cred.apiUrl}/stores/${this.cred.storeHash}/v3/catalog`
    }

    getRequestURL(config, args) {
        let uri = new URI(`${this.catalogApiUrl}/${config.uri}`)

        // delete the locale if we got one because it fouls the url. for bigcommerce, just use default 'en-US'
        // delete args.locale

        if (args && args.limit && args.offset) {
            args.page = Math.floor((args.offset / args.limit) + 1)
            // delete args.offset
        }

        let queryArgs = _.omit(args, ['locale', 'offset', 'single', 'language', 'country'])
        uri.addQuery(queryArgs)
        return uri        
    }

    async getHeaders() {
        return { 'X-Auth-Token': this.cred.apiToken }
    }

    async translateResults(data, mapper = (args => x => x)) {
        if (!Array.isArray(data.data)) {
            data = {
                data: [data.data],
                meta: {
                    pagination: {
                        total: 1,
                        count: 1,
                        per_page: 1,
                        current_page: 1
                    },
                }
            }
        }

        return {
            meta: {
                total: data.meta.pagination.total,
                count: data.meta.pagination.count,
                limit: data.meta.pagination.per_page,
                offset: (data.meta.pagination.current_page - 1) * data.meta.pagination.per_page,
            },
            results: await Promise.all(data.data.map(await mapper))
        }
    }
}

module.exports = BigCommerceBackend