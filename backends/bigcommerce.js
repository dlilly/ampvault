// 3rd party libs
const URI = require('urijs');
const _ = require('lodash')
const CommerceBackend = require('./index')

let mapImage = image => ({ url: image.url_standard })

let mapVariant = prod => variant => {
    let images = variant.image_url ? [{ url: variant.image_url }] : _.map(prod.images, mapImage)
    return {
        ...variant,
        prices: {
            list: variant.price || prod.price,
            sale: variant.sale_price || prod.price
        },
        defaultImage: _.first(images),
        images
    }
}

let mapProduct = prod => ({
    ...prod,
    shortDescription: prod.description,
    longDescription: prod.description,
    variants: _.map(prod.variants, mapVariant(prod))
})

class BigCommerceBackend extends CommerceBackend {
    constructor(cred) {
        super(cred)
        this.configs = {
            products: {
                uri: `products`,
                args: { include: 'images,variants' },
                mapper: mapProduct
            },
    
            categories: {
                uri: `categories`,
                mapper: async cat => ({
                    ...cat,
                    products: (await this.get('products', { "categories:in": cat.id })).results,
                    children: (await this.get('categories', { parent_id: cat.id })).results,
                })
            }
        }

        this.catalogApiUrl = `${this.cred.apiUrl}/stores/${this.cred.storeHash}/v3/catalog`
    }

    getRequestURL(config, args) {
        let uri = new URI(`${this.catalogApiUrl}/${config.uri}`)

        if (args && args.limit && args.offset) {
            args.page = Math.floor((args.offset / args.limit) + 1)
            delete args.offset
        }

        uri.addQuery(args)
        return uri        
    }

    async getHeaders() {
        return { 'X-Auth-Token': this.cred.apiToken }
    }

    async translateResults(data, mapper = (x => x)) {
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