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
                if (new_user_data.online == true){
                    console.log('connected')
                    return null
                } else {
                    console.log('disconnected')
                    return firestore.runTransaction((transaction) => {
                        const region_ref = firestore.collection('region').doc(new_user_data.region)
                        return transaction.get(region_ref).then(res => {
                            const data = res.data()
                            let user_list = (data.user || [])
                            user_list = user_list.filter((user) => user != new_user_data.uid)

                            return transaction.update(region_ref, {
                                user_count: user_list.length,
                                user: user_list
                            })
                        })
                    })
                    
                }   
            })


exports.generateChatroomOnRegionCreate = functions.firestore.document('region/{geohash}')
            .onCreate((snapshot, context) => {

                // const region_data = snapshot.data();

                const chatroom_ref = firestore.collection('chatroom')

                // const region_chatroom_ref = firestore.collection('region').doc(context.params.geohash)

                return chatroom_ref.add({
                    user_count: 0,
                    user: [],
                    geohash: context.params.geohash,
                    created_time: new Date(Date.now())
                })
                .catch(err => console.error(err))

            })

exports.manageChatroomOnRegionUpdate = functions.firestore.document('region/{geohash}')
            .onUpdate((snapshot, context) => {

                const new_region_data = snapshot.after.data();
                const old_region_data = snapshot.before.data();

                const new_user_count = new_region_data.user_count
                const old_user_count = old_region_data.user_count

                const new_chatroom_count = Math.ceil(new_user_count / 20)
                const old_chatroom_count = Math.ceil(old_user_count / 20)

                const chatroom_ref = firestore.collection('chatroom')

                if (new_chatroom_count > old_chatroom_count){
                    console.log('create a new room')
                    return chatroom_ref.add({
                        user_count: 0,
                        user: [],
                        geohash: context.params.geohash,
                        created_time: new Date(Date.now())
                    })
                    .catch(err => console.error(err))
                }

                if (new_chatroom_count < old_chatroom_count){
                    return chatroom_ref.where('geohash', '==', context.params.geohash).where('user_count', '==', 0).limit(1).get()
                    .then(res => {
                        if (res.size == 0){
                            return null
                        }
                        return res.docs[0].ref.delete()
                        .catch(err => console.log(err))
                    })
                    .catch(err => console.error(err))
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