module.exports = (client) => {
  return {
    addTrackedUser: async (id) => {
      // return;
      if (await client.db.collection("trackedUsers").findOne({ _id: id })) return
      await client.db.collection('trackedUsers').insertOne({ _id: id, new: true })
    },

    getLinkedAccount: async (user) => {
      let account = await client.db.collection('linkedUsers').findOne({ _id: user.id }, { wbId: 1 })
      return account ? account.wbId : null
    }
  }
}