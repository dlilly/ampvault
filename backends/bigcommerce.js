const axios = require('axios')
const _ = require('lodash')

module.exports = cred => {
    let catalogApiUrl = `${cred.apiUrl}/stores/${cred.storeHash}/v3/catalog`

    // mappers
    let mapImage = image => ({ url: image.url_standard })

    let mapCategory = cat => ({
        name: cat.name,
        id: cat.id
    })

    let mapProduct = prod => ({
        id: prod.id,
        name: prod.name,
        shortDescription: prod.description,
        longDescription: prod.description,
        variants: _.map(prod.variants, mapVariant(prod))
    })

    let mapVariant = prod => variant => {
        let images = variant.image_url ? [{ url: variant.image_url }] : _.map(prod.images, mapImage)
        return {
            id: variant.id,
            sku: variant.sku,
            prices: {
                list: variant.price || prod.price,
                sale: variant.sale_price || prod.price
            },
            defaultImage: _.first(images),
            images
        }
    }

    let populateCategory = async cat => ({
        ...cat,
        products: _.get(await makeCatalogAPIRequest({ key: "products", args: { "categories:in": cat.id } }), 'results'),
        children: _.get(await makeCatalogAPIRequest({ key: "categories", args: { parent_id: cat.id } }), 'results')
    })

    let configs = {
        products: {
            uri: `products`,
            args: { include: 'images,variants' },
            mapper: mapProduct
        },

        categories: {
            uri: `categories`,
            mapper: populateCategory
        }
    }
    // include: 'images,variants'
    // end mappers

    // makes a request to the BC API with the given uri and formats the response data with the given mapper
    let makeCatalogAPIRequest = async ({ key, args, mapper, single }) => {
        let config = configs[key]
        let uri = config.uri

        if (args && args.limit && args.offset) {
            args.page = Math.floor((args.offset / args.limit) + 1)
            delete args.offset
        }

        args = _.merge(args, config.args)

        let queryString = '?'
        _.each(args, (v, k) => {
            let vs = Array.isArray(v) ? v : [v]
            _.each(vs, x => {
                if (k === 'id') {
                    queryString = `/${x}` + queryString
                }
                else if (x) {
                    queryString += `${k}=${x}&`
                }
            })
        })
        
        let url = `${catalogApiUrl}/${uri}${queryString}`
        console.log(`bc uri ${url}`)
        const response = await axios(url, { headers: { 'X-Auth-Token': cred.apiToken } });

        let { data, meta } = response.data
        let m = mapper || config.mapper

        if (!Array.isArray(data) || single) {
            return await m(Array.getAsObject(data))
        }
        else {
            return {
                meta: {
                    total: meta.pagination.total,
                    count: meta.pagination.count,
                    limit: meta.pagination.per_page,
                    offset: (meta.pagination.current_page - 1) * meta.pagination.per_page,
                },
                results: await Promise.all(data.map(await m))
            }
        }
    }

    let bc = {
        products: {
            get: async (_, args) => await makeCatalogAPIRequest({ key: 'products', args }),
            getOne: async (_, args) => await makeCatalogAPIRequest({ key: 'products', args })
        },
        categories: {
            get: async (_, args) => await makeCatalogAPIRequest({ key: 'categories', args }),
            getOne: async (_, args) => await makeCatalogAPIRequest({ key: 'categories', args })
        },
        type: 'bigcommerce'
    }
    return bc
}