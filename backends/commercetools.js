// 3rd party libs
const URI = require('urijs');
const fetch = require('node-fetch');
const _ = require('lodash')

const { createClient } = require('@commercetools/sdk-client')
const { createAuthMiddlewareForClientCredentialsFlow } = require('@commercetools/sdk-middleware-auth');
const { createHttpMiddleware } = require('@commercetools/sdk-middleware-http')

        // what can args be? limit, offset, locale, id, sku, slug, keyword
        // then they just need to be translated into opts!
        // product projection search
        // all = ``
        // search text = text.en="coolbox"
        // id = filter=id:"b1c7af6e-937d-49d4-9bf2-a215edcf68e4"
        // sku = filter=variants.sku:"miyagi-do-dojo-t-shirt"
        // slug = filter=slug.en:"coolbox"

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
    
    let mapImage = image => image && ({ url: image.url })
    let mapVariant = variant => ({
        ...variant,
        prices      : { list: _.get(_.first(variant.prices), 'value.centAmount') / 100 },
        images      : _.map(variant.images, mapImage),
        defaultImage: mapImage(_.first(variant.images))
    })

    let mapProduct = product => ({
        ...product,
        variants    : _.map(_.concat(product.variants, [product.masterVariant]), mapVariant),

        // the bug is in here somewhere i think.  oh!  cuz we need to map the category with populateCategory?  maybe?
        categories  : _.map(product.categories, 'obj')
    })

    let populateCategory = async (category) => {
        console.log(JSON.stringify(category))

        console.log(JSON.stringify({
            ...category,
            products: (await getProduct({ where: [`categories(id="${category.id}")`] })).results,
            children: (await getCategory({ where: [`parent(id="${category.id}")`] })).results
    }))

        return ({
            ...category,
            products: (await getProduct({ where: [`categories(id="${category.id}")`] })).results,
            children: (await getCategory({ where: [`parent(id="${category.id}")`] })).results
    })}

    // these are the (roughly) functions we need. do we need them on each operation? how do we determine how to return a single result or not? i don't want to use the flag :(
    let getRequest = (config, args) => {
        let uri = new URI(`/${cred.project}/${config.uri}`)

        let single = false
        let query = {}
        if (args.keyword) {
            query[`text.${args.locale}`] = args.keyword
        }
        if (args.slug) {
            query.filter = [`slug.${args.locale}:"${args.slug}"`]
            single = true
        }
        if (args.sku) {
            query.filter = [`variants.sku:"${args.sku}")`]
            single = true
        }
        if (args.id) {
            query.filter = [`id:"${args.id}"`]
            single = true
        }

        // add default args from the query type
        uri.addQuery(config.args)

        // add args from the query (limit, offset, locale)
        uri.addQuery(args)

        // add any filters based on the args
        uri.addQuery(query)

        return {
            uri: uri.toString(),
            single
        }
    }

    let translateResults = async (body, mapper, single) => {
        if (single) {
            return await mapper(Array.getAsObject(body.results))
        }
        else {
            return {
                meta: {
                    total: body.total,
                    count: body.count,
                    limit: body.limit,
                    offset: body.offset
                },
                results: await Promise.all(body.results.map(await mapper))
            }
        }
    }

    let request = config => async args => {
        let { uri, single } = getRequest(config, args)
        console.log(`[ ct ] ${uri}`)
        let { body } = await client.execute({ uri, method: 'GET' })
        return await translateResults(body, (config.mapper || (x => x)), single)
    }

    let getProduct = request({
        uri: `product-projections/search`,
        args: { expand: ['categories[*]'] },
        mapper: mapProduct
    })

    let getCategory = request({
        uri: `categories`,
        args: {}
    })

    let getExpandedCategory = request({
        uri: `categories`,
        args: {},
        mapper: populateCategory
    })

    let ct = {
        products: {
            get: getProduct,
            getOne: getProduct
        },
        categories: {
            get: async args => await getExpandedCategory({ ...args, where: [`ancestors is empty`] }),
            getOne: getExpandedCategory
        },
        type: 'commercetools'
    }
    return ct
}