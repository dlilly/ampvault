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
    
    let rb = createRequestBuilder({ projectKey: cred.project })
    _.each(Object.values(rb), operation => {
        operation.get = async (opts, query) => {
            let uri = operation.parse(opts).build()
            let separator = uri.indexOf("?") > -1 ? "&" : "?"
            uri  = `${uri}${separator}${_.map(query, (v, k) => `${k}=${v}`).join("&")}`
            return await client.execute({ uri, method: 'GET' })
        }
    })
    return {
        ...rb,
        type: 'commercetools'
    }    
}