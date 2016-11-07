/* Shows summarized stats for all modes for a player. */

var utils = require('./utils.js'),
    request = require('request-promise'),
    Promise = require('promise');

if (require.main === module) {
    var process = require('process'),
        Table = require('cli-table');
    var args = process.argv.slice(2);

    if (args.length < 4) {
        console.error("usage: node " + __filename + " <gamertag> <character> <count>");
        var table = new Table();
        table.push({ "gamertag": "your gamertag" },
            {"character": "either a 0, 1, or 2, depending on which character you want to look at.  correlates to the character selection screen, with 0 being the top"},
            {"count": "number of games to include"}
        );
        console.error(table.toString());
        process.exit();
    }

    var gTag = args[0],
        charIndex = args[1],
        type = args[2],
        count = args[3];

    function getDetails(match) {
         var url = utils.buildPostgameURL(match.instanceId);
        // console.log(url);
        return request({
            url: url,
            json: true
        })
    }

    function summarize(fireteam, matches) {
        // Name K A D K/D KA/D Score
        var rows = [];
        fireteam.forEach(function(name, pIndex) {
            var r = [name];
            var filteredMatches = matches.filter(function(f) { return f.results[pIndex]; });
            r.push(utils.average(filteredMatches.map(function(m) { return parseInt(m.results[pIndex].kills); })));
            r.push(utils.average(filteredMatches.map(function(m) { return parseInt(m.results[pIndex].assists); })));
            r.push(utils.average(filteredMatches.map(function(m) { return parseInt(m.results[pIndex].deaths); })));
            r.push((r[1] / r[3]).toFixed(2).toString());
            r.push(((r[1] + r[2]) / r[3]).toFixed(2).toString());
            r.push(utils.average(filteredMatches.map(function(m) { return parseInt(m.results[pIndex].score) })));
            rows.push(r);
        });

        return rows;
    }

    // callback hell!
    utils.lookupPlayer(gTag, charIndex, function(memId, charId) {
        getFireteam(memId, type, function(fireteam) {
            utils.getSummary(memId, charId, type, count, function(games) {
                Promise.all(games.map(function(g) { return getDetails(g); }))
                    .then(function(results) {
                        // find the KDR for all of the fireteam members.
                        var kdrs = results.map(function(r,i) {
                            var map = { map: games[i].mapName, results: [] };
                            r.Response.data.entries.forEach(function (player) {
                                var pName = player.player.destinyUserInfo.displayName;
                                var pInd = fireteam.indexOf(pName);
                                if (pInd !== -1) {
                                    map.results[pInd] = {
                                        assists: player.values.assists.basic.displayValue,
                                        kills: player.values.kills.basic.displayValue,
                                        deaths: player.values.deaths.basic.displayValue,
                                        score: player.values.score.basic.value,
                                        w1hash: player.extended.weapons[0].referenceId,
                                        w1kills: player.extended.weapons[0].values.uniqueWeaponKills.basic.displayValue,
                                        w1pkills: player.extended.weapons[0].values.uniqueWeaponPrecisionKills.basic.displayValue,
                                        w2hash: player.extended.weapons[1].referenceId,
                                        w2kills: player.extended.weapons[1].values.uniqueWeaponKills.basic.displayValue,
                                        w2pkills: player.extended.weapons[1].values.uniqueWeaponPrecisionKills.basic.displayValue,
                                        w3hash: player.extended.weapons[2].referenceId,
                                        w3kills: player.extended.weapons[2].values.uniqueWeaponKills.basic.displayValue,
                                        w3pkills: player.extended.weapons[2].values.uniqueWeaponPrecisionKills.basic.displayValue,
                                        w4hash: player.extended.weapons[3].referenceId,
                                        w4kills: player.extended.weapons[3].values.uniqueWeaponKills.basic.displayValue,
                                        w4pkills: player.extended.weapons[3].values.uniqueWeaponPrecisionKills.basic.displayValue,
                                        w5hash: player.extended.weapons[4].referenceId,
                                        w5kills: player.extended.weapons[4].values.uniqueWeaponKills.basic.displayValue,
                                        w5pkills: player.extended.weapons[4].values.uniqueWeaponPrecisionKills.basic.displayValue
                                    };
                                }
                            });
                            return map;
                        });
                        var summed = summarize(fireteam, kdrs);
                        var table = new Table({ head: ["Name", "Kills", "Assists", "Deaths", "K/D", "KA/D", "Score"] });
                        summed.forEach(function(s) { table.push(s); });
                        console.log(table.toString());
                    });
            });
        });
    })
}
