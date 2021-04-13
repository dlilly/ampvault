const admin = require('firebase-admin')
const _ = require('lodash')

let localCredentials = []
let remoteCredentials = []

let getCredentials = () => _.uniqBy(_.concat(remoteCredentials, localCredentials), x => x.storeHash || x.project)
let getCredential = key => _.find(getCredentials(), cred => (cred.storeHash || cred.project) === key) || _.first(getCredentials())

module.exports = config => ({
    getClient: async key => {
        if (config.credential && _.isEmpty(remoteCredentials)) {
            admin.initializeApp({
                credential: admin.credential.cert(config.credential)
            });
        
            let db = admin.firestore();
            let query = db.collection(config.collection)
        
            let snapshot = await query.get()
            remoteCredentials = _.map(snapshot.docs, doc => doc.data())
        
            query.onSnapshot(async snapshot => {
                remoteCredentials = _.map(snapshot.docs, doc => doc.data())
            })
        }
    
        let cred = getCredential(key)
        if (cred) {
            let backend = require(`./backends/${cred.type}`)
            return new backend(cred)
        }
        else {
            throw new Error(`No commerce backend matches key [ ${key} ]. Please make sure you have set the 'x-commerce-backend-key' header.`)
        }
    }
})