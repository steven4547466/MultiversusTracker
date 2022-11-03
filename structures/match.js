class Match {
  constructor(rawData) {
    this._id = rawData.id
    this.type = rawData.template.slug == "1v1" ? 0 : rawData.template.slug == "2v2" ? 1 : 2
    this.players = []
    this.date = new Date(rawData.completion_time)
    this.startDate = new Date(rawData.created_at)

    this.averageRating = 0
    for (let player of rawData.server_data.PlayerData) {
      let playerData = rawData.data.ratingUpdates ? rawData.data.ratingUpdates.player_rating_changes.find(c => c.player_account_id == player.AccountId) : null
      this.averageRating += playerData.preMatchRating.mean
      this.players.push(
        {
          id: player.AccountId,
          teamIndex: player.TeamIndex,
          character: player.CharacterSlug,
          preMatchRating: playerData.pre_match_rating,
          postMatchRating: playerData.post_match_rating,
          deaths: player.Deaths,
          ringouts: player.Ringouts,
          assists: player.Score - player.Ringouts,
          damage: player.DamageDone
        }
      )
    }
    this.map = rawData.server_data.MapName

    this.draw = rawData.draw

    this.averageRating /= this.players.length
    this.winningTeam = rawData.server_data.WinningTeamId
  }
}

module.exports = Match;