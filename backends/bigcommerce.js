const axios = require('axios')
const _ = require('lodash')

module.exports = cred => {
    let catalogApiUrl = `${cred.apiUrl}/stores/${cred.storeHash}/v3/catalog`

    // makes a request to the BC API with the given uri and formats the response data with the given mapper
    let makeCatalogAPIRequest = async ({ uri, opts, mapper }) => {
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
        
        const response = await axios(`${catalogApiUrl}${uri}${queryString}`, { headers: { 'X-Auth-Token': cred.apiToken } });
        if (!Array.isArray(response.data.data)) {
            return await mapper(response.data.data)
        }
        else {
            if (opts.sku) {
                return await mapper(_.first(response.data.data))
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
    }

    return {
        products: {
            get: async opts => await makeCatalogAPIRequest({ ...opts, uri: '/products' })
        },
        categories: {
            get: async opts => await makeCatalogAPIRequest({ ...opts, uri: '/categories' })
        },
        type: 'bigcommerce'
    }
}