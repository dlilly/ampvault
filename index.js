const admin = require('firebase-admin')
const _ = require('lodash')

module.exports = async (opts = {}) => {
    let localCredentials = []
    let remoteCredentials = []

    let getCredentials = () => _.uniqBy(_.concat(remoteCredentials, localCredentials), x => x.storeHash || x.project)
    let getCredential = key => _.find(getCredentials(), cred => (cred.storeHash || cred.project) === key) || _.first(getCredentials())

    if (opts.credential) {
        admin.initializeApp({
            credential: admin.credential.cert(opts.credential)
        });

        let db = admin.firestore();
        let query = db.collection(opts.collection)
    
        let snapshot = await query.get()
        remoteCredentials = _.map(snapshot.docs, doc => doc.data())
    
        query.onSnapshot(async snapshot => {
            remoteCredentials = _.map(snapshot.docs, doc => doc.data())
        })
    }

    return {
        addCredential: cred => {
            localCredentials.push(cred)
        },

        getCredential,

        getClient: key => {
            let cred = getCredential(key)
            if (cred) {
                return require(`./backends/${cred.type}`)(cred)
            }
            else {
                throw new Error(`No commerce backend matches key [ ${key} ]. Please make sure you have set the 'x-commerce-backend-key' header.`)
            }
        }
    }
}