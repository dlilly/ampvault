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
        products: _.get(await getProducts({ "categories:in": cat.id }), 'results'),
        children: _.get(await bc.categories.get({ opts: { parent_id: cat.id }, mapper: mapCategory }), 'results')
    })
    // end mappers

    // makes a request to the BC API with the given uri and formats the response data with the given mapper
    let makeCatalogAPIRequest = async ({ uri, opts = {}, mapper }) => {
        if (opts.limit && opts.offset) {
            opts.page = Math.floor((opts.offset / opts.limit) + 1)
            delete opts.offset
        }

        let queryString = '?'
        _.each(opts, (v, k) => {
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
        
        let url = `${catalogApiUrl}${uri}${queryString}`
        const response = await axios(url, { headers: { 'X-Auth-Token': cred.apiToken } });

        if (!Array.isArray(response.data.data)) {
            return await mapper(response.data.data)
        }
        else {
            let results = await Promise.all(response.data.data.map(await mapper))
            return {
                total: response.data.meta.pagination.total,
                count: response.data.meta.pagination.count,
                limit: response.data.meta.pagination.per_page,
                offset: (response.data.meta.pagination.current_page - 1) * response.data.meta.pagination.per_page,
                results
            }
        }
    }

    let bc = {
        products: {
            get: async opts => await makeCatalogAPIRequest({ ...opts, uri: '/products', mapper: opts.mapper || mapProduct })
        },
        categories: {
            get: async opts => await makeCatalogAPIRequest({ ...opts, uri: '/categories', mapper: opts.mapper || populateCategory })
        },
        type: 'bigcommerce'
    }
    return bc
}