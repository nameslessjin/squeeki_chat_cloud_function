const functions = require('firebase-functions');
const admin = require('firebase-admin')
admin.initializeApp(functions.config().firebase);

var database = admin.database()
var firestore = admin.firestore()
// // Create and Deploy Your First Cloud Functions
// // https://firebase.google.com/docs/functions/write-firebase-functions
//
// exports.helloWorld = functions.https.onRequest((request, response) => {
//  response.send("Hello from Firebase!");
// });

exports.realTimeUserUpdate = functions.database.ref('user/{user_id}')
            .onUpdate((snapshot, context) => {
                const new_user_data = snapshot.after.val()
                const old_user_data = snapshot.before.val()
                const new_region = new_user_data.geohash
                const old_region = old_user_data.geohash
                const new_chatroom_id = new_user_data.chatroom_id
                const old_chatroom_id = old_user_data.chatroom_id
                if (new_user_data.online == true){


                    

                    return null
                } else {
                    // if user go offline
                    return firestore.runTransaction((transaction) => {
                        const chatroom_ref = firestore.collection('region').doc(new_region)
                        .collection('chatroom').doc(new_user_data.chatroom_id)
                        return transaction.get(chatroom_ref).then(res => {
                            const region_ref = firestore.collection('region').doc(new_region)
                            // console.log(res.exists)

                            if(!res.exists){
                                return transaction.get(region_ref).then(res => {

                                    const data = res.data()
                                    let user_list = (data.user || [])
                                    user_list = user_list.filter((user) => user != new_user_data.uid)
                                    return transaction.update(region_ref, {
                                        user_count: user_list.length,
                                        user: user_list
                                    })
                                }).catch(err => console.error(err))
                            }

                            const data = res.data()
                            let user_list = (data.user || [])
                            user_list = user_list.filter((user) => user != new_user_data.uid)

                            firestore.runTransaction((secondTransaction) => {
                                return secondTransaction.get(region_ref).then(res => {
 
                                    const data = res.data()
                                    let user_list = (data.user || [])
                                    user_list = user_list.filter((user) => user != new_user_data.uid)
                                    return secondTransaction.update(region_ref, {
                                        user_count: user_list.length,
                                        user: user_list
                                    })
                                }).catch(err => console.error(err))
                            })

                            return transaction.update(chatroom_ref, {
                                user_count: user_list.length,
                                user: user_list
                            })
                        })
                    })
                    
                }   
            })


const generateChatroom = (geohash) => {
    
    const chatroom_ref = firestore.collection('region').doc(geohash).collection('chatroom')

    const titles = ['Do you go to your 8 AM class today ?', 'Party Squad', 'God, life sucks']
    const title = titles[Math.floor(Math.random() * titles.length)]

    return chatroom_ref.add({
        title : title,
        user_count: 0,
        user: [],
        created_time: new Date(Date.now()),
        max_user_num: 200,
        full: false,
    })
    .then(res => {
        // console.log(res.id)
        const chatroom_realtime_ref = database.ref(`chatroom/${geohash}/${res.id}`)
        chatroom_realtime_ref.set({
            geohash: geohash
        })
    })
    .catch(err => console.error(err))
    
}

const deleteChatroomMod = (chatroom_id) => {
    const chatroom_moderator_ref = firestore.collection('chatroom_moderator').doc(chatroom_id)
    console.log(chatroom_id)
    return chatroom_moderator_ref.delete().catch(err => console.log(err))
}

exports.generateChatroomOnRegionCreate = functions.firestore.document('region/{geohash}')
            .onCreate((snapshot, context) => {
                return generateChatroom(context.params.geohash)
            })


exports.manageChatroomOnRegionUpdate = functions.firestore.document('region/{geohash}')
            .onUpdate((snapshot, context) => {

                const new_region_data = snapshot.after.data();
                const old_region_data = snapshot.before.data();
                const new_user_count = new_region_data.user_count
                const old_user_count = old_region_data.user_count
                const new_chatroom_count = Math.ceil(new_user_count / 20)
                const old_chatroom_count = Math.ceil(old_user_count / 20)
                const chatroom_ref = firestore.collection('region').doc(context.params.geohash).collection('chatroom')
                
                

                if (new_chatroom_count > old_chatroom_count){
                    // console.log('create a new room')
                    return generateChatroom(context.params.geohash)
                }

                if (new_chatroom_count < old_chatroom_count){
                    return chatroom_ref.where('user_count', '==', 0).limit(1).get()
                    .then(res => {
                        if (res.size == 0){
                            return null
                        }

                        const chatroom_realtime_ref = database.ref(`chatroom/${context.params.geohash}/${res.docs[0].id}`)
                        chatroom_realtime_ref.remove().catch(err => console.log(err))
                        deleteChatroomMod(res.docs[0].id)
                        return res.docs[0].ref.delete()
                        .catch(err => console.log(err))
                    })
                    .catch(err => console.error(err))
                }
                return null

            })

exports.onChatroomUpdate = functions.firestore.document('region/{geohash}/chatroom/{chatroom_id}')
            .onUpdate((snapshot, context) => {
                const new_data = snapshot.after.data()
                const old_data = snapshot.before.data()
                const new_user_list = [...new_data.user]
                const old_user_list = [...old_data.user]

                //check if there is change in user_list
                let change_in_user = null
                if (new_user_list.length > old_user_list.length){
                    change_in_user = new_user_list.filter((user => {
                        const user_index = old_user_list.indexOf(user)
                        return (user_index == -1) ? true : false
                    }))[0]
                }

                if (new_user_list.length < old_user_list.length){
                    change_in_user = old_user_list.filter((user => {
                        const user_index = new_user_list.indexOf(user)
                        return (user_index == -1) ? true : false
                    }))[0]
                }
                // if there is no change in user do nothing
                // console.log(change_in_user)
                if (change_in_user == null){

                } else {
                    const moderator_ref = firestore.collection('chatroom_moderator').doc(context.params.chatroom_id)
                    return firestore.runTransaction(transaction => {
                        return transaction.get(moderator_ref).then(res => {
                            let moderator_list = (res.exists) ? [...res.data().moderator] : []
                            if (new_user_list.length < old_user_list.length){
                                moderator_list = moderator_list.filter(moderator => {
                                    return moderator != change_in_user
                                })
                            }
                            let user_list_without_moderator = []
                            const temp = Math.ceil(new_user_list.length / 10)

                            //
                            if (moderator_list.length < temp){
                                user_list_without_moderator = new_user_list.filter( user => {
                                    const user_index = moderator_list.indexOf(user)
                                    return (user_index == -1) ? true : false
                                })
                                const new_moderator = user_list_without_moderator[Math.floor(Math.random() * user_list_without_moderator.length)]
                                moderator_list.push(new_moderator)
                            } else if (temp == 0){
                                moderator_list = []
                            }
                            // console.log(moderator_list)
                            if (res.exists){
                                return transaction.update(moderator_ref, {
                                    moderator: moderator_list,
                                    moderator_count: moderator_list.length
                                })
                            } else {
                                return transaction.set(moderator_ref,{
                                    moderator: moderator_list,
                                    moderator_count: moderator_list.length
                                })
                            }
                        })
                    }).catch(err => console.error(err))
                }
                return null
            })

exports.onChatroomModeratorCreate = functions.firestore.document('chatroom_moderator/{chatroom_moderator_id}')
            .onCreate((snapshot, context) => {
                const data = snapshot.data()
                const moderator_id = data.moderator[0]
                // console.log(data)
                const user_ref = database.ref('user').orderByChild('uid').equalTo(moderator_id).limitToFirst(1)
                return user_ref.once('value').then(res => {
                    res.forEach(data => {
                        data.ref.update({
                            isModerator: true
                        })
                    })
                })
            })
    
exports.onChatroomModeratorUpdate = functions.firestore.document('chatroom_moderator/{chatroom_moderator_id}')
            .onUpdate((snapshot, context) => {
                const new_data = snapshot.after.data()
                const old_data = snapshot.before.data()
                const new_moderator_list = [...new_data.moderator]
                const old_moderator_list = [...old_data.moderator]

                let change_in_mod = null

                let demod = old_moderator_list.filter(moderator => {
                    const index = new_moderator_list.indexOf(moderator)
                    return (index == -1) ? true : false
                })[0] || null

                let promod = new_moderator_list.filter(moderator => {
                    const index = old_moderator_list.indexOf(moderator)
                    return (index == -1) ? true : false
                })[0] || null

                console.log('demond: ', demod)
                if (demod != null){
                    const user_ref = database.ref('user').orderByChild('uid').equalTo(demod).limitToFirst(1)
                    user_ref.once('value').then(res => {
                        res.forEach(data => {
                            data.ref.update({
                                isModerator: false
                            })
                        })
                    })
                }

                console.log('promod: ', promod)
                if (promod != null){
                    const user_ref = database.ref('user').orderByChild('uid').equalTo(promod).limitToFirst(1)
                    user_ref.once('value').then(res => {
                        res.forEach(data => {
                            data.ref.update({
                                isModerator: true
                            })
                        })
                    })
                }

                return null
            })

// exports.generateChatroom = functions.database.ref('region/{geohash}')
//         .onCreate((snapshot, context) => {

//             const regionData = snapshot.val();
//             console.log(regionData)
//             console.log(context)
//             const chatroomRef = database.ref('chatroom')

//             return chatroomRef.push({
//                 geohash: context.params.geohash,
//                 createdTime: context.timestamp,
//                 user_count: 0
                
//             })

//         })

// exports.onRegionUpdateChatroom = functions.database.ref('region/{geohash}')
//         .onUpdate((snapshot, context) => {
//             const region_newData = snapshot.after.val();
//             const region_oldData = snapshot.before.val();

//             const chatroomRef = database.ref('chatroom')

//             const new_user_count = region_newData.user_count
//             const old_user_count = region_oldData.user_count
//             const new_chatroom_count = Math.ceil(new_user_count / 20)
//             const old_chatroom_count = Math.ceil(old_user_count / 20)



//             if (new_chatroom_count > old_chatroom_count){
//                 return chatroomRef.push({
//                     geohash: context.params.geohash,
//                     createdTime: context.timestamp,
//                     user_count: 0
//                 })
//             }

//             if (new_chatroom_count < old_chatroom_count){
//                 return chatroomRef.orderByChild('geohash').equalTo(context.params.geohash).once('value').then(res => {
//                     if (res.exists){
//                         res.forEach(data => {
//                             const roomData = data.val()
//                             if (roomData.user_count == 0){
//                                 return data.ref.remove()
//                             }
//                         })
//                     }
//                 })

//             }

//             return
            
//         })