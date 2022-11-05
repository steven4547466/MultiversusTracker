const { Client: MultiversusClient } = require("multiversus.js")
const { MongoClient } = require('mongodb')
const Match = require("./structures/match")
const fs = require("fs")

console.log("Starting..")

const templatesToRequest = ["1v1", "2v2", "ffa"]
const config = require("./config.json")

let client

let db

async function addTrackedUser(id) {
  try {
    if (await db.collection("trackedUsers").findOne({ _id: id })) return
    await db.collection('trackedUsers').insertOne({ _id: id, new: true })
  } catch (e) {
    // console.error(e)
    // Unresolved leading to attempted duplicate, just ignore.
  }

}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function hasAny(matchId) {
  return new Promise(async resolve => {
    resolve(await db.collection('matches').find({ _id: matchId }).hasNext())
  })
}

function allPlayersPresentInRatingUpdates(match) {
  for (let player of match.server_data.PlayerData) {
    if (!match.data.ratingUpdates.playerRatingChanges.some(r => r.playerAccountID === player.AccountId))
      return false
  }
  return true
}

function shouldAdd(match) {
  if (!match.server_data || match.server_data.IsCustomMatch || !match.server_data.PlayerData || (match.template.slug == "2v2" && match.server_data.PlayerData.length < 4) ||
    match.server_data.PlayerData.some(p => p.AccountId.startsWith("bot")) || !match.data || !match.data.ratingUpdates || !allPlayersPresentInRatingUpdates(match))
    return false
  return true
}

function addNewUsers(match) {
  for (let player of match.server_data.PlayerData) {
    if (Math.random() <= 0.02)
      addTrackedUser(player.AccountId)
  }
}

function doRequestAndReturnPromise(requests) {
  return new Promise(async (resolve, reject) => {
    resolve({
      data: await client.batchRequest(requests),
      chunks: requests
    })
  })
}

async function fetchUsers(trackedUsers) {
  let tempDate = await db.collection('lastUpdate').findOne({ _id: "lastUpdate" })
  let lastUpdate = tempDate ? tempDate.lastUpdate : 0
  let matchesToRequest = new Set()
  let newUsers = []
  let usersNeedRequesting = []
  console.log("Beginning match update check for " + trackedUsers.length + " tracked users. Last update: " + lastUpdate)

  let milestones = {
    users: 0,
    nextMilestone: 0.05
  }

  for (let user of trackedUsers) {
    if (!user.new) {
      usersNeedRequesting[user._id] = { totalPages: 2, lastPageChecked: 0 }
    }
    else {
      newUsers[user._id] = 0
    }
  }

  console.log("Beginning request cycle")

  let newUserRequests = []
  let tempRequests = []
  for (let [id, totalPages] of Object.entries(newUsers)) {
    tempRequests.push(`/matches/all/${id}`)
  }

  milestones = {
    chunks: 0,
    nextMilestone: 0.05
  }

  let addedAll = []

  {
    console.log("Beginning initial new user request cycle for " + tempRequests.length + " pages of match history")
    let promises = []
    const chunkSize = 100;
    for (let i = 0; i < tempRequests.length; i += chunkSize) {
      if (promises.length >= 35) {
        let now = Date.now()
        let resolved = await Promise.all(promises)
        // console.log("resolved " + resolved.length + " requests in " + (Date.now() - now) + "ms")
        for (let k = 0; k < resolved.length; k++) {
          let data = resolved[k].data
          for (let j = 0; j < data.responses.length; j++) {
            let response = data.responses[j]
            let id = resolved[k].chunks[j].split('/')[3].split("?")[0]
            let matches = response.body.matches || []
            for (let match of matches) {
              if (match.completion_time && templatesToRequest.includes(match.template.slug)) {
                if (addedAll.length > 10) {
                  // let x = Date.now()
                  await Promise.all(addedAll)
                  // console.log("Done resolving " + (Date.now() - x) + "ms")
                  addedAll = []
                }
                let p = hasAny(match.id)
                addedAll.push(p)
                p.then((exists) => {
                  if (!exists)
                    matchesToRequest.add(`/matches/${match.id}`)
                })
              }
            }
            // console.log(newUsers[id])
            newUsers[id] = response.body.total_pages
            // console.log(newUsers[id])
          }
        }
        promises = []
      }
      milestones.chunks++
      if (milestones.chunks / Math.ceil(tempRequests.length / chunkSize) >= milestones.nextMilestone) {
        console.log(`${new Date().toString()} New user requests initial page ${milestones.chunks / Math.ceil(tempRequests.length / chunkSize) * 100}% complete (${milestones.chunks}/${Math.ceil(tempRequests.length / chunkSize)})`)
        milestones.nextMilestone += 0.05
      }
      promises.push(doRequestAndReturnPromise(tempRequests.slice(i, i + chunkSize)))
    }

    if (promises.length > 0) {
      let now = Date.now()
      let resolved = await Promise.all(promises)
      // console.log("resolved " + resolved.length + " requests in " + (Date.now() - now) + "ms")
      for (let k = 0; k < resolved.length; k++) {
        let data = resolved[k].data
        for (let j = 0; j < data.responses.length; j++) {
          let response = data.responses[j]
          let id = resolved[k].chunks[j].split('/')[3].split("?")[0]
          let matches = response.body.matches || []
          for (let match of matches) {
            if (match.completion_time && templatesToRequest.includes(match.template.slug)) {
              if (addedAll.length > 10) {
                // console.log("Waiting for all promises to resolve")
                await Promise.all(addedAll)
                // console.log("resolved")
                addedAll = []
              }
              let p = hasAny(match.id)
              addedAll.push(p)
              p.then((exists) => {
                if (!exists)
                  matchesToRequest.add(`/matches/${match.id}`)
              })
            }
          }
          // console.log(newUsers[id])
          newUsers[id] = response.body.total_pages
          // console.log(newUsers[id])
        }
      }
      promises = []
    }
  }

  console.log(`${new Date().toString()} New user initial page requests complete`)

  let ps = []
  for (let [id, totalPages] of Object.entries(newUsers)) {
    if (ps.length > 10) {
      await Promise.all(ps)
      ps = []
    }
    for (let i = 2; i <= totalPages; i++)
      newUserRequests.push(`/matches/all/${id}?page=${i}`)
    ps.push(db.collection('trackedUsers').updateOne({ _id: id }, { $set: { new: false } }))
  }

  milestones = {
    chunks: 0,
    nextMilestone: 0.05
  }

  {
    console.log("Beginning new user request cycle for " + newUserRequests.length + " pages of match history")
    let promises = []
    const chunkSize = 100;
    for (let i = 0; i < newUserRequests.length; i += chunkSize) {
      if (promises.length >= 35) {
        // let now = Date.now()
        let resolved = await Promise.all(promises)
        // console.log("resolved " + resolved.length + " requests in " + (Date.now() - now) + "ms")
        for (let k = 0; k < resolved.length; k++) {
          let data = resolved[k]
          for (let response of data.responses) {
            let matches = response.body.matches || []
            for (let match of matches) {
              if (match.completion_time && templatesToRequest.includes(match.template.slug)) {
                if (addedAll.length > 10) {
                  await Promise.all(addedAll)
                  addedAll = []
                }
                let p = hasAny(match.id)
                addedAll.push(p)
                p.then((exists) => {
                  if (!exists)
                    matchesToRequest.add(`/matches/${match.id}`)
                })
              }
            }
          }
        }
        promises = []
      }
      milestones.chunks++
      if (milestones.chunks / Math.ceil(newUserRequests.length / chunkSize) >= milestones.nextMilestone) {
        console.log(`${new Date().toString()} New user requests ${milestones.chunks / Math.ceil(newUserRequests.length / chunkSize) * 100}% complete (${milestones.chunks}/${Math.ceil(newUserRequests.length / chunkSize)})`)
        milestones.nextMilestone += 0.05
      }
      const chunk = newUserRequests.slice(i, i + chunkSize);
      promises.push(client.batchRequest(chunk))
    }

    if (promises.length > 0) {
      // let now = Date.now()
      let resolved = await Promise.all(promises)
      // console.log("resolved " + resolved.length + " requests in " + (Date.now() - now) + "ms")
      for (let k = 0; k < resolved.length; k++) {
        let data = resolved[k]
        for (let response of data.responses) {
          let matches = response.body.matches || []
          for (let match of matches) {
            if (match.completion_time && templatesToRequest.includes(match.template.slug)) {
              if (addedAll.length > 10) {
                await Promise.all(addedAll)
                addedAll = []
              }
              let p = hasAny(match.id)
              addedAll.push(p)
              p.then((exists) => {
                if (!exists)
                  matchesToRequest.add(`/matches/${match.id}`)
              })
            }
          }
        }
      }
      promises = []
    }
  }

  console.log(`${new Date().toString()} New user requests complete`)

  // NEW USERS DONE ABOVE

  {
    let tempRequests = []
    for (let [id, user] of Object.entries(usersNeedRequesting)) {
      tempRequests.push(`/matches/all/${id}`)
    }

    milestones = {
      chunks: 0,
      nextMilestone: 0.05
    }

    {
      console.log("Beginning initial user request cycle for " + tempRequests.length + " pages of match history")
      let promises = []
      const chunkSize = 100;
      for (let i = 0; i < tempRequests.length; i += chunkSize) {
        if (promises.length >= 35) {
          // let now = Date.now()
          let resolved = await Promise.all(promises)
          // console.log("resolved " + resolved.length + " requests in " + (Date.now() - now) + "ms")
          for (let k = 0; k < resolved.length; k++) {
            let data = resolved[k].data
            for (let j = 0; j < data.responses.length; j++) {
              let response = data.responses[j]
              let id = resolved[k].chunks[j].split('/')[3].split("?")[0]
              let matches = response.body.matches || []
              for (let match of matches) {
                if (match.completion_time && templatesToRequest.includes(match.template.slug)) {
                  if (addedAll.length > 10) {
                    await Promise.all(addedAll)
                    addedAll = []
                  }
                  let p = hasAny(match.id)
                  addedAll.push(p)
                  p.then((exists) => {
                    if (!exists)
                      matchesToRequest.add(`/matches/${match.id}`)
                  })
                }
              }
              // console.log(newUsers[id])
              usersNeedRequesting[id] = { totalPages: response.body.total_pages, lastPageChecked: 1 }
              // console.log(newUsers[id])
            }
          }
          promises = []
        }
        milestones.chunks++
        if (milestones.chunks / Math.ceil(tempRequests.length / chunkSize) >= milestones.nextMilestone) {
          console.log(`${new Date().toString()} Not new user requests initial page ${milestones.chunks / Math.ceil(tempRequests.length / chunkSize) * 100}% complete (${milestones.chunks}/${Math.ceil(tempRequests.length / chunkSize)})`)
          milestones.nextMilestone += 0.05
        }
        promises.push(doRequestAndReturnPromise(tempRequests.slice(i, i + chunkSize)))
      }

      if (promises.length > 0) {
        // let now = Date.now()
        let resolved = await Promise.all(promises)
        // console.log("resolved " + resolved.length + " requests in " + (Date.now() - now) + "ms")
        for (let k = 0; k < resolved.length; k++) {
          let data = resolved[k].data
          for (let j = 0; j < data.responses.length; j++) {
            let response = data.responses[j]
            let id = resolved[k].chunks[j].split('/')[3].split("?")[0]
            let matches = response.body.matches || []
            for (let match of matches) {
              if (match.completion_time && templatesToRequest.includes(match.template.slug)) {
                if (addedAll.length > 10) {
                  await Promise.all(addedAll)
                  addedAll = []
                }
                let p = hasAny(match.id)
                addedAll.push(p)
                p.then((exists) => {
                  if (!exists)
                    matchesToRequest.add(`/matches/${match.id}`)
                })
              }
            }
            // console.log(newUsers[id])
            usersNeedRequesting[id] = { totalPages: response.body.total_pages, lastPageChecked: 1 }
            // console.log(newUsers[id])
          }
        }
        promises = []
      }
    }

    console.log(`${new Date().toString()} Not new user initial page requests complete`)

    let pass = 0
    while (Object.keys(usersNeedRequesting).length > 0) {
      pass++
      let userRequests = []
      for (let [id, user] of Object.entries(usersNeedRequesting)) {
        // let user = usersNeedRequesting[j]
        for (let i = user.lastPageChecked + 1; i <= user.lastPageChecked + 11; i++) {
          user.lastPageChecked = i
          if (i > user.totalPages) {
            delete usersNeedRequesting[id]
            break
          }
          userRequests.push(`/matches/all/${id}?page=${i}`)
        }
      }

      console.log("Beginning user request cycle for " + userRequests.length + " pages of match history. Pass " + pass)

      milestones = {
        chunks: 0,
        nextMilestone: 0.05
      }

      let ignoreFrom = []
      const chunkSize = 100;
      let numUsers = userRequests.length
      let promises = []
      for (let i = 0; i < numUsers; i += chunkSize) {
        if (promises.length >= 35) {
          // let now = Date.now()
          let resolved = await Promise.all(promises)
          // console.log("resolved " + resolved.length + " requests in " + (Date.now() - now) + "ms")
          for (let k = 0; k < resolved.length; k++) {
            let data = resolved[k].data
            for (let j = 0; j < data.responses.length; j++) {
              let id = resolved[k].chunks[j].split('/')[3].split("?")[0]
              if (ignoreFrom.includes(id))
                continue
              let response = data.responses[j]
              let matches = response.body.matches || []
              for (let match of matches) {
                if (match.completion_time && templatesToRequest.includes(match.template.slug)) {
                  if (match.completion_time) {
                    if (new Date(match.completion_time) >= lastUpdate) {
                      if (templatesToRequest.includes(match.template.slug)) {
                        if (addedAll.length > 10) {
                          await Promise.all(addedAll)
                          addedAll = []
                        }
                        let p = hasAny(match.id)
                        addedAll.push(p)
                        p.then((exists) => {
                          if (!exists)
                            matchesToRequest.add(`/matches/${match.id}`)
                        })
                      }
                    }
                    else {
                      ignoreFrom.push(id)
                      // userRequests = userRequests.filter(r => !r.includes(id))
                      numUsers = userRequests.length
                      delete usersNeedRequesting[id]
                    }
                  }
                }
              }
            }
          }
          promises = []
        }

        milestones.chunks++
        if (milestones.chunks / Math.ceil(userRequests.length / chunkSize) >= milestones.nextMilestone) {
          console.log(`${new Date().toString()} Not new user requests ${milestones.chunks / Math.ceil(userRequests.length / chunkSize) * 100}% complete (${milestones.chunks}/${Math.ceil(userRequests.length / chunkSize)}). Pass: ${pass}`)
          milestones.nextMilestone += 0.05
        }

        let reqs = userRequests.slice(i, i + chunkSize)
        if (ignoreFrom.length > 0) {
          reqs = reqs.filter(r => !ignoreFrom.includes(r.split('/')[3].split("?")[0]))
        }
        if (reqs.length == 0)
          break
        promises.push(doRequestAndReturnPromise(reqs))
      }

      if (promises.length > 0) {
        // let now = Date.now()
        let resolved = await Promise.all(promises)
        // console.log("resolved " + resolved.length + " requests in " + (Date.now() - now) + "ms")
        for (let k = 0; k < resolved.length; k++) {
          let data = resolved[k].data
          for (let j = 0; j < data.responses.length; j++) {
            let id = resolved[k].chunks[j].split('/')[3].split("?")[0]
            if (ignoreFrom.includes(id))
              continue
            let response = data.responses[j]
            let matches = response.body.matches || []
            for (let match of matches) {
              if (match.completion_time && templatesToRequest.includes(match.template.slug)) {
                if (match.completion_time) {
                  if (new Date(match.completion_time) >= lastUpdate) {
                    if (templatesToRequest.includes(match.template.slug)) {
                      if (addedAll.length > 10) {
                        await Promise.all(addedAll)
                        addedAll = []
                      }
                      let p = hasAny(match.id)
                      addedAll.push(p)
                      p.then((exists) => {
                        if (!exists)
                          matchesToRequest.add(`/matches/${match.id}`)
                      })
                    }
                  }
                  else {
                    // userRequests = userRequests.filter(r => !r.includes(id))
                    numUsers = userRequests.length
                    delete usersNeedRequesting[id]
                  }
                }
              }
            }
          }
        }
        promises = []
      }
    }
  }

  console.log(`${new Date().toString()} Not new user page requests complete`)

  if (addedAll.length > 0) {
    await Promise.all(addedAll)
    addedAll = []
  }

  newUserRequests = null
  newUsers = null
  trackedUsers = null

  // console.log(`Filtering ${matchesToRequest.length} matches`)
  let matchesAdded = 0
  let requests = Array.from(matchesToRequest)
  // for (let id of matchesToRequest.filter(function (value, index, self) {
  //   return self.indexOf(value) === index;
  // }))
  //   requests.push(`/matches/${id}`)

  matchesToRequest = null

  console.log("Requesting " + requests.length + " matches.")
  milestones = {
    chunks: 0,
    nextMilestone: 0.05
  }

  let now = Date.now()
  {
    let errored = false
    let promises = []
    let matchesToAdd = []
    const chunkSize = 300
    for (let i = 0; i < requests.length; i += chunkSize) {
      if (errored) {
        console.log("Errored, retrying in 300 seconds")
        i -= chunkSize
        await wait(300000)
        errored = false
        promises = []
      }
      try {
        if (promises.length >= 20) {
          let now = Date.now()
          let resolved = await Promise.all(promises)
          // console.log("resolved " + resolved.length + " requests in " + (Date.now() - now) + "ms")
          for (let k = 0; k < resolved.length; k++) {
            let data = resolved[k]
            for (let response of data.responses) {
              if (response.status_code == 404) continue
              try {
                if (shouldAdd(response.body)) {
                  matchesAdded++
                  addNewUsers(response.body)
                  matchesToAdd.push(new Match(response.body))
                  if (matchesToAdd.length >= 1000) {
                    await db.collection('matches').insertMany(matchesToAdd)
                    matchesToAdd = []
                  }
                }
              } catch (e) {
                // console.error(e)
                // errored = true
              }
            }
          }
          promises = []
          if (Date.now() - now <= 1500) {
            await wait(1500 - (Date.now() - now))
          }
        }
        milestones.chunks++
        if (milestones.chunks / Math.ceil(requests.length / chunkSize) >= milestones.nextMilestone) {
          console.log(`${new Date().toString()} Requesting matches ${milestones.chunks / Math.ceil(requests.length / chunkSize) * 100}% complete (${milestones.chunks}/${Math.ceil(requests.length / chunkSize)}).`)
          milestones.nextMilestone += 0.05
        }
        let p = client.batchRequest(requests.slice(i, i + chunkSize))
        p.catch(e => {
          errored = true
          console.error(e)
        })
        promises.push(p)
      } catch (e) {
        // errored = true
        console.error(e)
      }

    }

    if (promises.length > 0) {
      // let now = Date.now()
      let resolved = await Promise.all(promises)
      // console.log("resolved " + resolved.length + " requests in " + (Date.now() - now) + "ms")
      for (let k = 0; k < resolved.length; k++) {
        let data = resolved[k]
        for (let response of data.responses) {
          if (response.status_code == 404) continue
          if (shouldAdd(response.body)) {
            matchesAdded++
            addNewUsers(response.body)
            matchesToAdd.push(new Match(response.body))
            if (matchesToAdd.length >= 1000) {
              try {
                await db.collection('matches').insertMany(matchesToAdd)
              }
              catch (e) { }

              matchesToAdd = []
            }
          }
        }
      }
      promises = []
    }

    if (matchesToAdd.length > 0) {
      try {
        await db.collection('matches').insertMany(matchesToAdd)
      }
      catch (e) { }
    }
  }

  console.log("Added " + matchesAdded + " new matches in " + (Date.now() - now) + "ms")
  // if (Date.now() - startedAt < 1200000)
  //   await wait(1200000 - (Date.now() - startedAt))
}

let count = 1

async function checkForMatchUpdates() {
  if (count++ % 24 == 0) {
    await db.collection('lastUpdate').updateOne({ _id: "lastUpdate" }, { $set: { lastUpdate: new Date() } }, { upsert: true })
  }
  let userCount = await db.collection('trackedUsers').count({})
  let tempDate = await db.collection('lastUpdate').findOne({ _id: "lastUpdate" })
  let lastUpdate = tempDate ? tempDate.lastUpdate : 0

  console.log("Beginning match update check for " + userCount + " total tracked users. Last update: " + lastUpdate)

  // generate a random number from 0 to userCount - 30000
  let random = Math.floor(Math.random() * (userCount - 30000))

  console.log("Skipping " + random + " users.")

  let cursor = await db.collection('trackedUsers').find({}).skip(random).limit(10000)
  let trackedUsers = []

  // await addTrackedUser("6286dac111f25eb46dcf6853")
  // console.log("after")
  // return;

  let startedAt = Date.now()
  while (await cursor.hasNext()) {
    if (trackedUsers.length >= 10000) {
      await fetchUsers(trackedUsers)
      trackedUsers = []
    }
    trackedUsers.push(await cursor.next())
  }

  if (trackedUsers.length > 0) {
    await fetchUsers(trackedUsers)
  }

  cursor.close()

  trackedUsers = null

  console.log("Operation complete. Took " + (Date.now() - startedAt) / 60000 + " minutes.")

  await wait(1800000) // Added because it was literally using 60TB of network bandwidth a month. The api is not optimized for bulk data requests like this and will run you out of bandwidth.

  checkForMatchUpdates()
}


client = new MultiversusClient(config.steamNameMatches, config.steamPasswordMatches)

// client.localAddress = "" // If you have multiple IPs, you can set this to the IP you want to use so the bot doesn't use the same rate limit as the bot.

client.on("ready", async () => {
  let mongoClient = new MongoClient(config.mongoDatabaseUrl)

  await mongoClient.connect()

  db = mongoClient.db(config.mongoDatabaseName)

  checkForMatchUpdates()
})