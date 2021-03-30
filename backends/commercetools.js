// 3rd party libs
const fetch = require('node-fetch');
const _ = require('lodash')

const { createClient } = require('@commercetools/sdk-client')
const { createAuthMiddlewareForClientCredentialsFlow } = require('@commercetools/sdk-middleware-auth');
const { createHttpMiddleware } = require('@commercetools/sdk-middleware-http')
const { createRequestBuilder } = require('@commercetools/api-request-builder')

module.exports = cred => {
    const authMiddleware = createAuthMiddlewareForClientCredentialsFlow({
        host: cred.oauth_url,
        projectKey: cred.project,
        credentials: {
            clientId: cred.client_id,
            clientSecret: cred.client_secret,
        },
        scopes: cred.scopes,
        fetch,
    })
    
    const httpMiddleware = createHttpMiddleware({ host: cred.api_url, fetch })
    const client = createClient({ middlewares: [authMiddleware, httpMiddleware] })
    
    let getLocalizedText = text => text['en'] || _.first(text)

    let mapImage = image => image && ({ url: image.url })
    let mapVariant = variant => ({
        id          : variant.id,
        sku         : variant.sku,
        prices      : { list: _.get(_.first(variant.prices), 'value.centAmount') / 100 },
        images      : _.map(variant.images, mapImage),
        defaultImage: mapImage(_.first(variant.images))
    })

    let mapProduct = product => ({
        id          : `${product.id}`,
        name        : `${getLocalizedText(product.name)}`,
        slug        : `${getLocalizedText(product.slug)}`,
        variants    : _.map(_.concat(product.variants, [product.masterVariant]), mapVariant),
        categories  : _.map(product.categories, mapCategory)
    })

    let mapCategory = category => {
        let cat = category.obj || category
        return {
            id      : category.id,
            name    : getLocalizedText(cat.name),
            slug    : getLocalizedText(cat.slug) 
        }
    }

    let populateCategory = async (category) => {
        let cat = mapCategory(category)

        // get the child products
        let products = (await rb.productProjections.get({ where: [`categories(id="${category.id}")`], expand: ['categories[*]'] })).results
    
        // get the child categories
        let children = (await rb.categories.get({ where: [`parent(id="${category.id}")`] }, {}, mapCategory)).results
    
        return {
            ...cat,
            products,
            children
        }
    }

    let mappers = {
        productProjections: mapProduct,
        productProjectionsSearch: mapProduct,
        categories: populateCategory
    }

    let rb = createRequestBuilder({ projectKey: cred.project })
    _.each(Object.keys(rb), key => {
        let operation = rb[key]
        operation.get = async (opts, query, mapper = mappers[key] || (x => x)) => {
            console.log(`opts ${JSON.stringify(opts)}`)
            console.log(`query ${JSON.stringify(query)}`)
            console.log(`op ${Object.keys(operation)}`)

            let uri = operation.parse(opts).build()
            let separator = uri.indexOf("?") > -1 ? "&" : "?"
            uri  = `${uri}${separator}${_.map(query, (v, k) => `${k}=${v}`).join("&")}`

            console.log(`ct ${uri}`)

            let { body } = await client.execute({ uri, method: 'GET' })

            if (query.sku || query.id || query.slug) {
                let result = _.first(body.results)
                console.log(`result ${JSON.stringify(result)}`)
                return await mapper(result)
            }
            else {
                return {
                    limit: body.limit,
                    count: body.count,
                    offset: body.offset,
                    total: body.total,
                    results: await Promise.all(body.results.map(await mapper))
                }
            }
        }
    })
    return {
        ...rb,
        type: 'commercetools'
    }    
}