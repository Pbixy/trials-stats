var request = require('request'),
    moment = require('moment'),
    process = require('process'),
    ProgressBar = require('progress'),
    fs = require('fs'),
    csv = require('csv-write-stream');

const EventEmitter = require('events'),
    util = require('util');

function GameDoneEmitter() {
    this.gamesStarted = 0;
    this.gamesDone = 0;
    EventEmitter.call(this);
}
util.inherits(GameDoneEmitter, EventEmitter);

var games = [];

const gameDoneEmitter = new GameDoneEmitter();
gameDoneEmitter.on('gameDone', function (game) {
    this.gamesDone += 1;
    pBar.tick();
    games.push(game);
    if (this.gamesDone === this.gamesStarted) {
        var sorted = games.sort(function (a, b) {
            return a.date - b.date;
        });

        console.log('\n');

        summarize(sorted);
        saveDetails(sorted);
        console.log("Finished!");
    }
});

gameDoneEmitter.on('gameStart', function () {
    this.gamesStarted += 1;
});


function buildPostgameURL(activityId) {
    return "http://proxy.guardian.gg/Platform/Destiny/Stats/PostGameCarnageReport/" + activityId + "/?definitions=false&lc=en";
}

function buildEloUrl(startDate, endDate, membershipIds) {
    return "http://api.guardian.gg/elo/history/" + membershipIds.join(',') + "?start=" + startDate + "&end=" + endDate + "&mode=14";
}

function getElos(gameDetail) {
    var gameDate = moment(gameDetail.date);
    var eloUrl = buildEloUrl(gameDate.format("YYYY-MM-DD"),
        gameDate.add(1, 'days').format("YYYY-MM-DD"),
        Object.keys(gameDetail.players).map(function (p) {
            return gameDetail.players[p].membershipId
        }));

    request({
        url: eloUrl,
        json: true
    }, function (error, response, body) {
        if (!error && response.statusCode === 200) {
            body.forEach(function (elo) {
                var pName = Object.keys(gameDetail.players).filter(function (name) {
                    return gameDetail.players[name].membershipId === elo.membershipId;
                })[0];
                var player = gameDetail.players[pName];
                player.elo = elo.elo;
                gameDetail.teams[player.teamName].elos.push(elo.elo);
            });

            if (gameDetail.teams["Alpha"].elos.length > 0) {
                gameDetail.teams["Alpha"].averageElo = average(gameDetail.teams["Alpha"].elos);
            } else {
                gameDetail.teams["Alpha"].averageElo = 0;
            }
            if (gameDetail.teams["Bravo"].elos.length > 0) {
                gameDetail.teams["Bravo"].averageElo = average(gameDetail.teams["Bravo"].elos);
            } else {
                gameDetail.teams["Bravo"].averageElo = 0;
            }

            gameDoneEmitter.emit('gameDone', gameDetail);
        } else {
            console.error("Error getting elos ", eloUrl, response);
        }
    })
}

function average(arr) {
    return Math.ceil(arr.reduce(function (a, b) {
            return a + b
        }) / arr.length);
}


function getDetails(match) {
    var url = buildPostgameURL(match.instanceId);
    // console.log(url);
    request({
        url: url,
        json: true
    }, function (error, response, body) {
        if (!error && response.statusCode === 200) {
            var details = {
                date: match.date.valueOf(),
                id: match.instanceId,
                map: match.mapName,
                gameType: match.gameType,
                players: {},
                teams: {}
            };
            var players = body.Response.data.entries.forEach(function (player) {
                var p = {
                    name: player.player.destinyUserInfo.displayName,
                    membershipId: player.player.destinyUserInfo.membershipId,
                    lightLevel: player.player.lightLevel,
                    teamName: player.values.team.basic.displayValue,
                    assists: player.values.assists.basic.displayValue,
                    kills: player.values.kills.basic.displayValue,
                    deaths: player.values.deaths.basic.displayValue,
                    kdr: player.values.killsDeathsRatio.basic.value,
                    kadr: player.values.killsDeathsAssists.basic.value,
                    weapons: {whash:[], wkills:[], wpkills:[]},
                    myScore: player.values.score.basic.value,
                    myClass: player.player.characterClass,
                    myMedals: {mCount: player.extended.values.allMedalsEarned.basic.value,
                               mNames:[],
                               mValues:[],
                               mWeights:[]},
                    myStats: {avgKillDist: (!!player.extended.values.averageKillDistance ? player.extended.values.averageKillDistance.basic.value:0),
                              avgDeathDist: (!!player.extended.values.averageDeathDistance ? player.extended.values.averageDeathDistance.basic.value:0),
                              avgLifespan: (!!player.extended.values.averageLifespan ? player.extended.values.averageLifespan.basic.value:0),
                              avgScorePerKill: (!!player.extended.values.averageScorePerKill ? player.extended.values.averageScorePerKill.basic.value:0),
                              avgScorePerLife: (!!player.extended.values.averageScorePerLife ? player.extended.values.averageScorePerLife.basic.value:0),
                              longestKillSpree: (!!player.extended.values.longestKillSpree ? player.extended.values.longestKillSpree.basic.value:0),
                              longestSingleLife: (!!player.extended.values.longestSingleLife ? player.extended.values.longestSingleLife.basic.value:0),
                              secondsPlayed: (!!player.extended.values.secondsPlayed ? player.extended.values.secondsPlayed.basic.value:0),
                              suicides: (!!player.extended.values.suicides ? player.extended.values.suicides.basic.value:0),
                              totalKillDistance: (!!player.extended.values.totalKillDistance ? player.extended.values.totalKillDistance.basic.value:0),
                              weaponBestType: (!!player.extended.values.weaponBestType ? player.extended.values.weaponBestType.basic.displayValue:0),
                              weaponKillsGrenade: (!!player.extended.values.weaponKillGrenade ? player.extended.values.weaponKillsGrenade.basic.value:0),
                              weaponKillsMelee: (!!player.extended.values.weaponKillMelee ? player.extended.values.weaponKillsMelee.basic.value:0),
                              weaponKillsSuper: (!!player.extended.values.weaponKillSuper ? player.extended.values.weaponKillsSuper.basic.value:0),
                              zonesCaptured: (!!player.extended.values.zonesCaptured ? player.extended.values.zonesCaptured.basic.value:0),
                              zonesNeutralized: (!!player.extended.values.zonesNeutralized ? player.extended.values.zonesNeutralized.basic.value:0),
                              sparksCaptured: (!!player.extended.values.sparksCaptured ? player.extended.values.sparksCaptured.basic.value:0),
                              slamDunks: (!!player.extended.values.slamDunks ? player.extended.values.slamDunks.basic.value:0),
                              styleDunks: (!!player.extended.values.styleDunks ? player.extended.values.styleDunks.basic.value:0),
                              dunkKills: (!!player.extended.values.dunkKills ? player.extended.values.dunkKills.basic.value:0),
                              carrierKills: (!!player.extended.values.carrierKills ? player.extended.values.carrierKills.basic.value:0),
                              tagCaptures: (!!player.extended.values.tagCaptures ? player.extended.values.tagCaptures.basic.value:0),
                              capturedYourOwnKill: (!!player.extended.values.capturedYourOwnKill ? player.extended.values.capturedYourOwnKill.basic.value:0),
                              lostTagToOpponent: (!!player.extended.values.lostTagToOpponent ? player.extended.values.lostTagToOpponent.basic.value:0),
                              recoveredOwnDeadTag: (!!player.extended.values.recoveredOwnDeadTag ? player.extended.values.recoveredOwnDeadTag.basic.value:0),
                              tagsCapturedPerTagLost: (!!player.extended.values.tagsCapturedPerTagLost ? player.extended.values.tagsCapturedPerTagLost.basic.value:0)
                             }          
                };
                
                if (!player.extended.weapons) {
                } else {
                    if (player.extended.weapons.length > 0) {
                        p.weapons.whash.push(player.extended.weapons[0].referenceId.toString());
                        p.weapons.wkills.push(player.extended.weapons[0].values.uniqueWeaponKills.basic.displayValue.toString());
                        p.weapons.wpkills.push(player.extended.weapons[0].values.uniqueWeaponPrecisionKills.basic.displayValue.toString());
                        if (player.extended.weapons.length > 1) {
                            p.weapons.whash.push(player.extended.weapons[1].referenceId.toString());
                            p.weapons.wkills.push(player.extended.weapons[1].values.uniqueWeaponKills.basic.displayValue.toString());
                            p.weapons.wpkills.push(player.extended.weapons[1].values.uniqueWeaponPrecisionKills.basic.displayValue.toString());
                            if (player.extended.weapons.length > 2) {
                                p.weapons.whash.push(player.extended.weapons[2].referenceId.toString());
                                p.weapons.wkills.push(player.extended.weapons[2].values.uniqueWeaponKills.basic.displayValue.toString());
                                p.weapons.wpkills.push(player.extended.weapons[2].values.uniqueWeaponPrecisionKills.basic.displayValue.toString());
                                if (player.extended.weapons.length > 3) {
                                    p.weapons.whash.push(player.extended.weapons[3].referenceId.toString());
                                    p.weapons.wkills.push(player.extended.weapons[3].values.uniqueWeaponKills.basic.displayValue.toString());
                                    p.weapons.wpkills.push(player.extended.weapons[3].values.uniqueWeaponPrecisionKills.basic.displayValue.toString());
                                    if (player.extended.weapons.length > 4) {
                                        p.weapons.whash.push(player.extended.weapons[4].referenceId.toString());
                                        p.weapons.wkills.push(player.extended.weapons[4].values.uniqueWeaponKills.basic.displayValue.toString());
                                        p.weapons.wpkills.push(player.extended.weapons[4].values.uniqueWeaponPrecisionKills.basic.displayValue.toString());
                                        if (player.extended.weapons.length > 5) {
                                            p.weapons.whash.push(player.extended.weapons[5].referenceId.toString());
                                            p.weapons.wkills.push(player.extended.weapons[5].values.uniqueWeaponKills.basic.displayValue.toString());
                                            p.weapons.wpkills.push(player.extended.weapons[5].values.uniqueWeaponPrecisionKills.basic.displayValue.toString());
                                            if (player.extended.weapons.length > 6) {
                                                 p.weapons.wpkills.push("too long " + player.extended.weapons.length);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                if (!!player.extended.values.medalsAbilityArcLightningKillMulti) {
                    p.myMedals.mNames.push("medalsAbilityArcLightningKillMulti");
                    p.myMedals.mValues.push(player.extended.values.medalsAbilityArcLightningKillMulti.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsAbilityArcLightningKillMulti.weighted.value);
                }
                if (!!player.extended.values.medalsAbilityGhostGunKillMulti) {
                    p.myMedals.mNames.push("medalsAbilityGhostGunKillMulti");
                    p.myMedals.mValues.push(player.extended.values.medalsAbilityGhostGunKillMulti.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsAbilityGhostGunKillMulti.weighted.value);
                }
                if (!!player.extended.values.medalsAbilityHavocKillMulti) {
                    p.myMedals.mNames.push("medalsAbilityHavocKillMulti");
                    p.myMedals.mValues.push(player.extended.values.medalsAbilityHavocKillMulti.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsAbilityHavocKillMulti.weighted.value);
                }
                if (!!player.extended.values.medalsAbilityNovaBombKillMulti) {
                    p.myMedals.mNames.push("medalsAbilityNovaBombKillMulti");
                    p.myMedals.mValues.push(player.extended.values.medalsAbilityNovaBombKillMulti.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsAbilityNovaBombKillMulti.weighted.value);
                }
                if (!!player.extended.values.medalsAbilityRadianceGrenadeKillMulti) {
                    p.myMedals.mNames.push("medalsAbilityRadianceGrenadeKillMulti");
                    p.myMedals.mValues.push(player.extended.values.medalsAbilityRadianceGrenadeKillMulti.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsAbilityRadianceGrenadeKillMulti.weighted.value);
                }
                if (!!player.extended.values.medalsAbilityShadowStrikeKillMulti) {
                    p.myMedals.mNames.push("medalsAbilityShadowStrikeKillMulti");
                    p.myMedals.mValues.push(player.extended.values.medalsAbilityShadowStrikeKillMulti.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsAbilityShadowStrikeKillMulti.weighted.value);
                }
                if (!!player.extended.values.medalsAbilityThermalHammerKillMulti) {
                    p.myMedals.mNames.push("medalsAbilityThermalHammerKillMulti");
                    p.myMedals.mValues.push(player.extended.values.medalsAbilityThermalHammerKillMulti.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsAbilityThermalHammerKillMulti.weighted.value);
                }
                if (!!player.extended.values.medalsAbilityVoidBowKillMulti) {
                    p.myMedals.mNames.push("medalsAbilityVoidBowKillMulti");
                    p.myMedals.mValues.push(player.extended.values.medalsAbilityVoidBowKillMulti.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsAbilityVoidBowKillMulti.weighted.value);
                }
                if (!!player.extended.values.medalsAbilityWardDeflect) {
                    p.myMedals.mNames.push("medalsAbilityWardDeflect");
                    p.myMedals.mValues.push(player.extended.values.medalsAbilityWardDeflect.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsAbilityWardDeflect.weighted.value);
                }
                if (!!player.extended.values.medalsActivityCompleteControlMostCaptures) {
                    p.myMedals.mNames.push("medalsActivityCompleteControlMostCaptures");
                    p.myMedals.mValues.push(player.extended.values.medalsActivityCompleteControlMostCaptures.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsActivityCompleteControlMostCaptures.weighted.value);
                }
                if (!!player.extended.values.medalsActivityCompleteCycle) {
                    p.myMedals.mNames.push("medalsActivityCompleteCycle");
                    p.myMedals.mValues.push(player.extended.values.medalsActivityCompleteCycle.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsActivityCompleteCycle.weighted.value);
                }
                if (!!player.extended.values.medalsActivityCompleteDeathless) {
                    p.myMedals.mNames.push("medalsActivityCompleteDeathless");
                    p.myMedals.mValues.push(player.extended.values.medalsActivityCompleteDeathless.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsActivityCompleteDeathless.weighted.value);
                }
                if (!!player.extended.values.medalsActivityCompleteHighestScoreLosing) {
                    p.myMedals.mNames.push("medalsActivityCompleteHighestScoreLosing");
                    p.myMedals.mValues.push(player.extended.values.medalsActivityCompleteHighestScoreLosing.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsActivityCompleteHighestScoreLosing.weighted.value);
                }
                if (!!player.extended.values.medalsActivityCompleteHighestScoreWinning) {
                    p.myMedals.mNames.push("medalsActivityCompleteHighestScoreWinning");
                    p.myMedals.mValues.push(player.extended.values.medalsActivityCompleteHighestScoreWinning.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsActivityCompleteHighestScoreWinning.weighted.value);
                }
                if (!!player.extended.values.medalsActivityCompleteLoneWolf) {
                    p.myMedals.mNames.push("medalsActivityCompleteLoneWolf");
                    p.myMedals.mValues.push(player.extended.values.medalsActivityCompleteLoneWolf.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsActivityCompleteLoneWolf.weighted.value);
                }
                if (!!player.extended.values.medalsActivityCompleteSalvageMostCancels) {
                    p.myMedals.mNames.push("medalsActivityCompleteSalvageMostCancels");
                    p.myMedals.mValues.push(player.extended.values.medalsActivityCompleteSalvageMostCancels.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsActivityCompleteSalvageMostCancels.weighted.value);
                }
                if (!!player.extended.values.medalsActivityCompleteSalvageShutout) {
                    p.myMedals.mNames.push("medalsActivityCompleteSalvageShutout");
                    p.myMedals.mValues.push(player.extended.values.medalsActivityCompleteSalvageShutout.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsActivityCompleteSalvageShutout.weighted.value);
                }
                if (!!player.extended.values.medalsActivityCompleteSingularityPerfectRunner) {
                    p.myMedals.mNames.push("medalsActivityCompleteSingularityPerfectRunner");
                    p.myMedals.mValues.push(player.extended.values.medalsActivityCompleteSingularityPerfectRunner.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsActivityCompleteSingularityPerfectRunner.weighted.value);
                }
                if (!!player.extended.values.medalsActivityCompleteVictory) {
                    p.myMedals.mNames.push("medalsActivityCompleteVictory");
                    p.myMedals.mValues.push(player.extended.values.medalsActivityCompleteVictory.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsActivityCompleteVictory.weighted.value);
                }
                if (!!player.extended.values.medalsActivityCompleteVictoryBlowout) {
                    p.myMedals.mNames.push("medalsActivityCompleteVictoryBlowout");
                    p.myMedals.mValues.push(player.extended.values.medalsActivityCompleteVictoryBlowout.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsActivityCompleteVictoryBlowout.weighted.value);
                }
                if (!!player.extended.values.medalsActivityCompleteVictoryElimination) {
                    p.myMedals.mNames.push("medalsActivityCompleteVictoryElimination");
                    p.myMedals.mValues.push(player.extended.values.medalsActivityCompleteVictoryElimination.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsActivityCompleteVictoryElimination.weighted.value);
                }
                if (!!player.extended.values.medalsActivityCompleteVictoryEliminationPerfect) {
                    p.myMedals.mNames.push("medalsActivityCompleteVictoryEliminationPerfect");
                    p.myMedals.mValues.push(player.extended.values.medalsActivityCompleteVictoryEliminationPerfect.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsActivityCompleteVictoryEliminationPerfect.weighted.value);
                }
                if (!!player.extended.values.medalsActivityCompleteVictoryEliminationShutout) {
                    p.myMedals.mNames.push("medalsActivityCompleteVictoryEliminationShutout");
                    p.myMedals.mValues.push(player.extended.values.medalsActivityCompleteVictoryEliminationShutout.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsActivityCompleteVictoryEliminationShutout.weighted.value);
                }
                if (!!player.extended.values.medalsActivityCompleteVictoryExtraLastSecond) {
                    p.myMedals.mNames.push("medalsActivityCompleteVictoryExtraLastSecond");
                    p.myMedals.mValues.push(player.extended.values.medalsActivityCompleteVictoryExtraLastSecond.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsActivityCompleteVictoryExtraLastSecond.weighted.value);
                }
                if (!!player.extended.values.medalsActivityCompleteVictoryLastSecond) {
                    p.myMedals.mNames.push("medalsActivityCompleteVictoryLastSecond");
                    p.myMedals.mValues.push(player.extended.values.medalsActivityCompleteVictoryLastSecond.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsActivityCompleteVictoryLastSecond.weighted.value);
                }
                if (!!player.extended.values.medalsActivityCompleteVictoryMercy) {
                    p.myMedals.mNames.push("medalsActivityCompleteVictoryMercy");
                    p.myMedals.mValues.push(player.extended.values.medalsActivityCompleteVictoryMercy.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsActivityCompleteVictoryMercy.weighted.value);
                }
                if (!!player.extended.values.medalsActivityCompleteVictoryRumble) {
                    p.myMedals.mNames.push("medalsActivityCompleteVictoryRumble");
                    p.myMedals.mValues.push(player.extended.values.medalsActivityCompleteVictoryRumble.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsActivityCompleteVictoryRumble.weighted.value);
                }
                if (!!player.extended.values.medalsActivityCompleteVictoryRumbleBlowout) {
                    p.myMedals.mNames.push("medalsActivityCompleteVictoryRumbleBlowout");
                    p.myMedals.mValues.push(player.extended.values.medalsActivityCompleteVictoryRumbleBlowout.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsActivityCompleteVictoryRumbleBlowout.weighted.value);
                }
                if (!!player.extended.values.medalsActivityCompleteVictoryRumbleLastSecond) {
                    p.myMedals.mNames.push("medalsActivityCompleteVictoryRumbleLastSecond");
                    p.myMedals.mValues.push(player.extended.values.medalsActivityCompleteVictoryRumbleLastSecond.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsActivityCompleteVictoryRumbleLastSecond.weighted.value);
                }
                if (!!player.extended.values.medalsActivityCompleteVictoryRumbleSuddenDeath) {
                    p.myMedals.mNames.push("medalsActivityCompleteVictoryRumbleSuddenDeath");
                    p.myMedals.mValues.push(player.extended.values.medalsActivityCompleteVictoryRumbleSuddenDeath.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsActivityCompleteVictoryRumbleSuddenDeath.weighted.value);
                }
                if (!!player.extended.values.medalsActivityCompleteVictorySuddenDeath) {
                    p.myMedals.mNames.push("medalsActivityCompleteVictorySuddenDeath");
                    p.myMedals.mValues.push(player.extended.values.medalsActivityCompleteVictorySuddenDeath.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsActivityCompleteVictorySuddenDeath.weighted.value);
                }
                if (!!player.extended.values.medalsAvenger) {
                    p.myMedals.mNames.push("medalsAvenger");
                    p.myMedals.mValues.push(player.extended.values.medalsAvenger.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsAvenger.weighted.value);
                }
                if (!!player.extended.values.medalsBuddyResurrectionMulti) {
                    p.myMedals.mNames.push("medalsBuddyResurrectionMulti");
                    p.myMedals.mValues.push(player.extended.values.medalsBuddyResurrectionMulti.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsBuddyResurrectionMulti.weighted.value);
                }
                if (!!player.extended.values.medalsBuddyResurrectionSpree) {
                    p.myMedals.mNames.push("medalsBuddyResurrectionSpree");
                    p.myMedals.mValues.push(player.extended.values.medalsBuddyResurrectionSpree.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsBuddyResurrectionSpree.weighted.value);
                }
                if (!!player.extended.values.medalsCloseCallTalent) {
                    p.myMedals.mNames.push("medalsCloseCallTalent");
                    p.myMedals.mValues.push(player.extended.values.medalsCloseCallTalent.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsCloseCallTalent.weighted.value);
                }
                if (!!player.extended.values.medalsComebackKill) {
                    p.myMedals.mNames.push("medalsComebackKill");
                    p.myMedals.mValues.push(player.extended.values.medalsComebackKill.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsComebackKill.weighted.value);
                }
                if (!!player.extended.values.medalsDominationKill) {
                    p.myMedals.mNames.push("medalsDominationKill");
                    p.myMedals.mValues.push(player.extended.values.medalsDominationKill.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsDominationKill.weighted.value);
                }
                if (!!player.extended.values.medalsDominionZoneCapturedSpree) {
                    p.myMedals.mNames.push("medalsDominionZoneCapturedSpree");
                    p.myMedals.mValues.push(player.extended.values.medalsDominionZoneCapturedSpree.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsDominionZoneCapturedSpree.weighted.value);
                }
                if (!!player.extended.values.medalsDominionZoneDefenseKillSpree) {
                    p.myMedals.mNames.push("medalsDominionZoneDefenseKillSpree");
                    p.myMedals.mValues.push(player.extended.values.medalsDominionZoneDefenseKillSpree.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsDominionZoneDefenseKillSpree.weighted.value);
                }
                if (!!player.extended.values.medalsDominionZoneOffenseKillSpree) {
                    p.myMedals.mNames.push("medalsDominionZoneOffenseKillSpree");
                    p.myMedals.mValues.push(player.extended.values.medalsDominionZoneOffenseKillSpree.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsDominionZoneOffenseKillSpree.weighted.value);
                }
                if (!!player.extended.values.medalsEliminationLastStandKill) {
                    p.myMedals.mNames.push("medalsEliminationLastStandKill");
                    p.myMedals.mValues.push(player.extended.values.medalsEliminationLastStandKill.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsEliminationLastStandKill.weighted.value);
                }
                if (!!player.extended.values.medalsEliminationLastStandRevive) {
                    p.myMedals.mNames.push("medalsEliminationLastStandRevive");
                    p.myMedals.mValues.push(player.extended.values.medalsEliminationLastStandRevive.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsEliminationLastStandRevive.weighted.value);
                }
                if (!!player.extended.values.medalsEliminationWipeQuick) {
                    p.myMedals.mNames.push("medalsEliminationWipeQuick");
                    p.myMedals.mValues.push(player.extended.values.medalsEliminationWipeQuick.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsEliminationWipeQuick.weighted.value);
                }
                if (!!player.extended.values.medalsEliminationWipeSolo) {
                    p.myMedals.mNames.push("medalsEliminationWipeSolo");
                    p.myMedals.mValues.push(player.extended.values.medalsEliminationWipeSolo.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsEliminationWipeSolo.weighted.value);
                }
                if (!!player.extended.values.medalsFirstBlood) {
                    p.myMedals.mNames.push("medalsFirstBlood");
                    p.myMedals.mValues.push(player.extended.values.medalsFirstBlood.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsFirstBlood.weighted.value);
                }
                if (!!player.extended.values.medalsFirstPlaceKillSpree) {
                    p.myMedals.mNames.push("medalsFirstPlaceKillSpree");
                    p.myMedals.mValues.push(player.extended.values.medalsFirstPlaceKillSpree.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsFirstPlaceKillSpree.weighted.value);
                }
                if (!!player.extended.values.medalsGrenadeKillStick) {
                    p.myMedals.mNames.push("medalsGrenadeKillStick");
                    p.myMedals.mValues.push(player.extended.values.medalsGrenadeKillStick.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsGrenadeKillStick.weighted.value);
                }
                if (!!player.extended.values.medalsHazardKill) {
                    p.myMedals.mNames.push("medalsHazardKill");
                    p.myMedals.mValues.push(player.extended.values.medalsHazardKill.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsHazardKill.weighted.value);
                }
                if (!!player.extended.values.medalsHunterKillInvisible) {
                    p.myMedals.mNames.push("medalsHunterKillInvisible");
                    p.myMedals.mValues.push(player.extended.values.medalsHunterKillInvisible.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsHunterKillInvisible.weighted.value);
                }
                if (!!player.extended.values.medalsKillAssistSpree) {
                    p.myMedals.mNames.push("medalsKillAssistSpree");
                    p.myMedals.mValues.push(player.extended.values.medalsKillAssistSpree.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsKillAssistSpree.weighted.value);
                }
                if (!!player.extended.values.medalsKillAssistSpreeFfa) {
                    p.myMedals.mNames.push("medalsKillAssistSpreeFfa");
                    p.myMedals.mValues.push(player.extended.values.medalsKillAssistSpreeFfa.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsKillAssistSpreeFfa.weighted.value);
                }
                if (!!player.extended.values.medalsKillHeadshot) {
                    p.myMedals.mNames.push("medalsKillHeadshot");
                    p.myMedals.mValues.push(player.extended.values.medalsKillHeadshot.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsKillHeadshot.weighted.value);
                }
                if (!!player.extended.values.medalsKilljoy) {
                    p.myMedals.mNames.push("medalsKilljoy");
                    p.myMedals.mValues.push(player.extended.values.medalsKilljoy.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsKilljoy.weighted.value);
                }
                if (!!player.extended.values.medalsKilljoyMega) {
                    p.myMedals.mNames.push("medalsKilljoyMega");
                    p.myMedals.mValues.push(player.extended.values.medalsKilljoyMega.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsKilljoyMega.weighted.value);
                }
                if (!!player.extended.values.medalsKillMulti2) {
                    p.myMedals.mNames.push("medalsKillMulti2");
                    p.myMedals.mValues.push(player.extended.values.medalsKillMulti2.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsKillMulti2.weighted.value);
                }
                if (!!player.extended.values.medalsKillMulti3) {
                    p.myMedals.mNames.push("medalsKillMulti3");
                    p.myMedals.mValues.push(player.extended.values.medalsKillMulti3.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsKillMulti3.weighted.value);
                }
                if (!!player.extended.values.medalsKillMulti4) {
                    p.myMedals.mNames.push("medalsKillMulti4");
                    p.myMedals.mValues.push(player.extended.values.medalsKillMulti4.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsKillMulti4.weighted.value);
                }
                if (!!player.extended.values.medalsKillMulti5) {
                    p.myMedals.mNames.push("medalsKillMulti5");
                    p.myMedals.mValues.push(player.extended.values.medalsKillMulti5.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsKillMulti5.weighted.value);
                }
                if (!!player.extended.values.medalsKillMulti6) {
                    p.myMedals.mNames.push("medalsKillMulti6");
                    p.myMedals.mValues.push(player.extended.values.medalsKillMulti6.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsKillMulti6.weighted.value);
                }
                if (!!player.extended.values.medalsKillMulti7) {
                    p.myMedals.mNames.push("medalsKillMulti7");
                    p.myMedals.mValues.push(player.extended.values.medalsKillMulti7.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsKillMulti7.weighted.value);
                }
                if (!!player.extended.values.medalsKillPostmortem) {
                    p.myMedals.mNames.push("medalsKillPostmortem");
                    p.myMedals.mValues.push(player.extended.values.medalsKillPostmortem.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsKillPostmortem.weighted.value);
                }
                if (!!player.extended.values.medalsKillSpree1) {
                    p.myMedals.mNames.push("medalsKillSpree1");
                    p.myMedals.mValues.push(player.extended.values.medalsKillSpree1.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsKillSpree1.weighted.value);
                }
                if (!!player.extended.values.medalsKillSpree2) {
                    p.myMedals.mNames.push("medalsKillSpree2");
                    p.myMedals.mValues.push(player.extended.values.medalsKillSpree2.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsKillSpree2.weighted.value);
                }
                if (!!player.extended.values.medalsKillSpree3) {
                    p.myMedals.mNames.push("medalsKillSpree3");
                    p.myMedals.mValues.push(player.extended.values.medalsKillSpree3.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsKillSpree3.weighted.value);
                }
                if (!!player.extended.values.medalsKillSpreeAbsurd) {
                    p.myMedals.mNames.push("medalsKillSpreeAbsurd");
                    p.myMedals.mValues.push(player.extended.values.medalsKillSpreeAbsurd.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsKillSpreeAbsurd.weighted.value);
                }
                if (!!player.extended.values.medalsKillSpreeNoDamage) {
                    p.myMedals.mNames.push("medalsKillSpreeNoDamage");
                    p.myMedals.mValues.push(player.extended.values.medalsKillSpreeNoDamage.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsKillSpreeNoDamage.weighted.value);
                }
                if (!!player.extended.values.medalsMeleeKillHunterThrowingKnifeHeadshot) {
                    p.myMedals.mNames.push("medalsMeleeKillHunterThrowingKnifeHeadshot");
                    p.myMedals.mValues.push(player.extended.values.medalsMeleeKillHunterThrowingKnifeHeadshot.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsMeleeKillHunterThrowingKnifeHeadshot.weighted.value);
                }
                if (!!player.extended.values.medalsPaybackKill) {
                    p.myMedals.mNames.push("medalsPaybackKill");
                    p.myMedals.mValues.push(player.extended.values.medalsPaybackKill.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsPaybackKill.weighted.value);
                }
                if (!!player.extended.values.medalsRadianceShutdown) {
                    p.myMedals.mNames.push("medalsRadianceShutdown");
                    p.myMedals.mValues.push(player.extended.values.medalsRadianceShutdown.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsRadianceShutdown.weighted.value);
                }
                if (!!player.extended.values.medalsRescue) {
                    p.myMedals.mNames.push("medalsRescue");
                    p.myMedals.mValues.push(player.extended.values.medalsRescue.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsRescue.weighted.value);
                }
                if (!!player.extended.values.medalsSalvageProbeCanceled) {
                    p.myMedals.mNames.push("medalsSalvageProbeCanceled");
                    p.myMedals.mValues.push(player.extended.values.medalsSalvageProbeCanceled.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsSalvageProbeCanceled.weighted.value);
                }
                if (!!player.extended.values.medalsSalvageProbeCompleteSpree) {
                    p.myMedals.mNames.push("medalsSalvageProbeCompleteSpree");
                    p.myMedals.mValues.push(player.extended.values.medalsSalvageProbeCompleteSpree.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsSalvageProbeCompleteSpree.weighted.value);
                }
                if (!!player.extended.values.medalsSalvageProbeDefenseKill) {
                    p.myMedals.mNames.push("medalsSalvageProbeDefenseKill");
                    p.myMedals.mValues.push(player.extended.values.medalsSalvageProbeDefenseKill.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsSalvageProbeDefenseKill.weighted.value);
                }
                if (!!player.extended.values.medalsSalvageProbeOffenseKillMulti) {
                    p.myMedals.mNames.push("medalsSalvageProbeOffenseKillMulti");
                    p.myMedals.mValues.push(player.extended.values.medalsSalvageProbeOffenseKillMulti.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsSalvageProbeOffenseKillMulti.weighted.value);
                }
                if (!!player.extended.values.medalsSalvageZoneCapturedSpree) {
                    p.myMedals.mNames.push("medalsSalvageZoneCapturedSpree");
                    p.myMedals.mValues.push(player.extended.values.medalsSalvageZoneCapturedSpree.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsSalvageZoneCapturedSpree.weighted.value);
                }
                if (!!player.extended.values.medalsSingularityFlagCaptureMulti) {
                    p.myMedals.mNames.push("medalsSingularityFlagCaptureMulti");
                    p.myMedals.mValues.push(player.extended.values.medalsSingularityFlagCaptureMulti.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsSingularityFlagCaptureMulti.weighted.value);
                }
                if (!!player.extended.values.medalsSingularityFlagHolderKilledClose) {
                    p.myMedals.mNames.push("medalsSingularityFlagHolderKilledClose");
                    p.myMedals.mValues.push(player.extended.values.medalsSingularityFlagHolderKilledClose.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsSingularityFlagHolderKilledClose.weighted.value);
                }
                if (!!player.extended.values.medalsSingularityFlagHolderKilledMulti) {
                    p.myMedals.mNames.push("medalsSingularityFlagHolderKilledMulti");
                    p.myMedals.mValues.push(player.extended.values.medalsSingularityFlagHolderKilledMulti.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsSingularityFlagHolderKilledMulti.weighted.value);
                }
                if (!!player.extended.values.medalsSingularityRunnerDefenseMulti) {
                    p.myMedals.mNames.push("medalsSingularityRunnerDefenseMulti");
                    p.myMedals.mValues.push(player.extended.values.medalsSingularityRunnerDefenseMulti.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsSingularityRunnerDefenseMulti.weighted.value);
                }
                if (!!player.extended.values.medalsSupremacy) {
                    p.myMedals.mNames.push("medalsSupremacy");
                    p.myMedals.mValues.push(player.extended.values.medalsSupremacy.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsSupremacy.weighted.value);
                }
                if (!!player.extended.values.medalsSupremacyConfirmStreakLarge) {
                    p.myMedals.mNames.push("medalsSupremacyConfirmStreakLarge");
                    p.myMedals.mValues.push(player.extended.values.medalsSupremacyConfirmStreakLarge.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsSupremacyConfirmStreakLarge.weighted.value);
                }
                if (!!player.extended.values.medalsSupremacyDenyMulti) {
                    p.myMedals.mNames.push("medalsSupremacyDenyMulti");
                    p.myMedals.mValues.push(player.extended.values.medalsSupremacyDenyMulti.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsSupremacyDenyMulti.weighted.value);
                }
                if (!!player.extended.values.medalsSupremacyMostConfirms) {
                    p.myMedals.mNames.push("medalsSupremacyMostConfirms");
                    p.myMedals.mValues.push(player.extended.values.medalsSupremacyMostConfirms.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsSupremacyMostConfirms.weighted.value);
                }
                if (!!player.extended.values.medalsSupremacyMostDenies) {
                    p.myMedals.mNames.push("medalsSupremacyMostDenies");
                    p.myMedals.mValues.push(player.extended.values.medalsSupremacyMostDenies.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsSupremacyMostDenies.weighted.value);
                }
                if (!!player.extended.values.medalsSupremacyMostSelfConfirms) {
                    p.myMedals.mNames.push("medalsSupremacyMostSelfConfirms");
                    p.myMedals.mValues.push(player.extended.values.medalsSupremacyMostSelfConfirms.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsSupremacyMostSelfConfirms.weighted.value);
                }
                if (!!player.extended.values.medalsSupremacyMulti) {
                    p.myMedals.mNames.push("medalsSupremacyMulti");
                    p.myMedals.mValues.push(player.extended.values.medalsSupremacyMulti.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsSupremacyMulti.weighted.value);
                }
                if (!!player.extended.values.medalsSupremacyNeverCollected) {
                    p.myMedals.mNames.push("medalsSupremacyNeverCollected");
                    p.myMedals.mValues.push(player.extended.values.medalsSupremacyNeverCollected.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsSupremacyNeverCollected.weighted.value);
                }
                if (!!player.extended.values.medalsSupremacySelfDeny) {
                    p.myMedals.mNames.push("medalsSupremacySelfDeny");
                    p.myMedals.mValues.push(player.extended.values.medalsSupremacySelfDeny.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsSupremacySelfDeny.weighted.value);
                }
                if (!!player.extended.values.medalsTeamDominationHold1m) {
                    p.myMedals.mNames.push("medalsTeamDominationHold1m");
                    p.myMedals.mValues.push(player.extended.values.medalsTeamDominationHold1m.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsTeamDominationHold1m.weighted.value);
                }
                if (!!player.extended.values.medalsTeamKillSpree) {
                    p.myMedals.mNames.push("medalsTeamKillSpree");
                    p.myMedals.mValues.push(player.extended.values.medalsTeamKillSpree.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsTeamKillSpree.weighted.value);
                }
                if (!!player.extended.values.medalsUnknown) {
                    p.myMedals.mNames.push("medalsUnknown");
                    p.myMedals.mValues.push(player.extended.values.medalsUnknown.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsUnknown.weighted.value);
                }
                if (!!player.extended.values.medalsVehicleFotcTurretKillSpree) {
                    p.myMedals.mNames.push("medalsVehicleFotcTurretKillSpree");
                    p.myMedals.mValues.push(player.extended.values.medalsVehicleFotcTurretKillSpree.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsVehicleFotcTurretKillSpree.weighted.value);
                }
                if (!!player.extended.values.medalsVehicleInterceptorKillSplatter) {
                    p.myMedals.mNames.push("medalsVehicleInterceptorKillSplatter");
                    p.myMedals.mValues.push(player.extended.values.medalsVehicleInterceptorKillSplatter.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsVehicleInterceptorKillSplatter.weighted.value);
                }
                if (!!player.extended.values.medalsVehicleInterceptorKillSpree) {
                    p.myMedals.mNames.push("medalsVehicleInterceptorKillSpree");
                    p.myMedals.mValues.push(player.extended.values.medalsVehicleInterceptorKillSpree.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsVehicleInterceptorKillSpree.weighted.value);
                }
                if (!!player.extended.values.medalsVehiclePikeKillSplatter) {
                    p.myMedals.mNames.push("medalsVehiclePikeKillSplatter");
                    p.myMedals.mValues.push(player.extended.values.medalsVehiclePikeKillSplatter.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsVehiclePikeKillSplatter.weighted.value);
                }
                if (!!player.extended.values.medalsVehiclePikeKillSpree) {
                    p.myMedals.mNames.push("medalsVehiclePikeKillSpree");
                    p.myMedals.mValues.push(player.extended.values.medalsVehiclePikeKillSpree.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsVehiclePikeKillSpree.weighted.value);
                }
                if (!!player.extended.values.medalsVehicleSparrowKillSplatter) {
                    p.myMedals.mNames.push("medalsVehicleSparrowKillSplatter");
                    p.myMedals.mValues.push(player.extended.values.medalsVehicleSparrowKillSplatter.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsVehicleSparrowKillSplatter.weighted.value);
                }
                if (!!player.extended.values.medalsWeaponAutoRifleKillSpree) {
                    p.myMedals.mNames.push("medalsWeaponAutoRifleKillSpree");
                    p.myMedals.mValues.push(player.extended.values.medalsWeaponAutoRifleKillSpree.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsWeaponAutoRifleKillSpree.weighted.value);
                }
                if (!!player.extended.values.medalsWeaponFusionRifleKillSpree) {
                    p.myMedals.mNames.push("medalsWeaponFusionRifleKillSpree");
                    p.myMedals.mValues.push(player.extended.values.medalsWeaponFusionRifleKillSpree.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsWeaponFusionRifleKillSpree.weighted.value);
                }
                if (!!player.extended.values.medalsWeaponHandCannonHeadshotSpree) {
                    p.myMedals.mNames.push("medalsWeaponHandCannonHeadshotSpree");
                    p.myMedals.mValues.push(player.extended.values.medalsWeaponHandCannonHeadshotSpree.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsWeaponHandCannonHeadshotSpree.weighted.value);
                }
                if (!!player.extended.values.medalsWeaponMachineGunKillSpree) {
                    p.myMedals.mNames.push("medalsWeaponMachineGunKillSpree");
                    p.myMedals.mValues.push(player.extended.values.medalsWeaponMachineGunKillSpree.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsWeaponMachineGunKillSpree.weighted.value);
                }
                if (!!player.extended.values.medalsWeaponPulseRifleKillSpree) {
                    p.myMedals.mNames.push("medalsWeaponPulseRifleKillSpree");
                    p.myMedals.mValues.push(player.extended.values.medalsWeaponPulseRifleKillSpree.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsWeaponPulseRifleKillSpree.weighted.value);
                }
                if (!!player.extended.values.medalsWeaponRocketLauncherKillSpree) {
                    p.myMedals.mNames.push("medalsWeaponRocketLauncherKillSpree");
                    p.myMedals.mValues.push(player.extended.values.medalsWeaponRocketLauncherKillSpree.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsWeaponRocketLauncherKillSpree.weighted.value);
                }
                if (!!player.extended.values.medalsWeaponScoutRifleKillSpree) {
                    p.myMedals.mNames.push("medalsWeaponScoutRifleKillSpree");
                    p.myMedals.mValues.push(player.extended.values.medalsWeaponScoutRifleKillSpree.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsWeaponScoutRifleKillSpree.weighted.value);
                }
                if (!!player.extended.values.medalsWeaponShotgunKillSpree) {
                    p.myMedals.mNames.push("medalsWeaponShotgunKillSpree");
                    p.myMedals.mValues.push(player.extended.values.medalsWeaponShotgunKillSpree.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsWeaponShotgunKillSpree.weighted.value);
                }
                if (!!player.extended.values.medalsWeaponSidearmKillSpree) {
                    p.myMedals.mNames.push("medalsWeaponSidearmKillSpree");
                    p.myMedals.mValues.push(player.extended.values.medalsWeaponSidearmKillSpree.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsWeaponSidearmKillSpree.weighted.value);
                }
                if (!!player.extended.values.medalsWeaponSniperRifleHeadshotSpree) {
                    p.myMedals.mNames.push("medalsWeaponSniperRifleHeadshotSpree");
                    p.myMedals.mValues.push(player.extended.values.medalsWeaponSniperRifleHeadshotSpree.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsWeaponSniperRifleHeadshotSpree.weighted.value);
                }
                if (!!player.extended.values.medalsWeaponSwordKillSpree) {
                    p.myMedals.mNames.push("medalsWeaponSwordKillSpree");
                    p.myMedals.mValues.push(player.extended.values.medalsWeaponSwordKillSpree.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsWeaponSwordKillSpree.weighted.value);
                }
                if (!!player.extended.values.medalsWinningScore) {
                    p.myMedals.mNames.push("medalsWinningScore");
                    p.myMedals.mValues.push(player.extended.values.medalsWinningScore.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsWinningScore.weighted.value);
                }
                if (!!player.extended.values.medalsZoneCapturedBInitial) {
                    p.myMedals.mNames.push("medalsZoneCapturedBInitial");
                    p.myMedals.mValues.push(player.extended.values.medalsZoneCapturedBInitial.basic.value);
                    p.myMedals.mWeights.push(player.extended.values.medalsZoneCapturedBInitial.weighted.value);
                }
                
                    
                details.players[p.name] = p;

                if (!details.teams[p.teamName]) {
                    details.teams[p.teamName] = {
                        score: p.myScore,
                        result: player.values.standing.basic.displayValue,
                        lightLevels: [],
                        elos: []
                    }
                } else {
                    details.teams[p.teamName].score += p.myScore;
                }
                    
                details.teams[p.teamName].lightLevels.push(p.lightLevel);

            });

            // get the average light level per team
            details.teams["Alpha"].averageLightLevel = average(details.teams["Alpha"].lightLevels);
            details.teams["Bravo"].averageLightLevel = average(details.teams["Bravo"].lightLevels);

            gameDoneEmitter.emit('gameDone', details);
        }
    })
}

const classes = ["Titan", "Hunter", "Warlock"];
const gameModes = ["None", "", "Story", "Strike", "Raid", "AllPvP", "Patrol", "AllPvE", "PvPIntroduction", 
                   "ThreeVsThree", "Control", "Lockdown", "Team", "FreeForAll", "TrialsOfOsiris", "Doubles", 
                   "Nightfall", "Heroic", "AllStrikes", "IronBanner", "AllArena", "Arena", "ArenaChallenge", 
                   "Elimination", "Rift", "AllMayhem", "MayhemClash", "MayhemRumble", "ZoneControl", "Racing", 
                   "ArenaElderChallenge", "Supremacy", "PrivateMatchesAll"];

function lookupPlayer(userName) {
    // get the membership id and character id
    process.stdout.write("Looking up " + userName + "... ");
    request({
        url: "http://proxy.guardian.gg/Platform/Destiny/SearchDestinyPlayer/1/" + userName + "/",
        json: true
    }, function (error, response, body) {
        if (!error && response.statusCode === 200) {
            var membershipId = body.Response[0].membershipId;
            request({
                url: "http://proxy.guardian.gg/Platform/Destiny/1/Account/" + membershipId + "/Summary/",
                json: true
            }, function (error, response, body) {
                if (!error && response.statusCode === 200) {
                    var chars = body.Response.data.characters.map(function (c) {
                        return {
                            characterId: c.characterBase.characterId,
                            classType: classes[c.characterBase.classType]
                        };
                    });

                    process.stdout.write("OK.\n");
                    getSummary(membershipId, chars);

                } else {
                    process.stdout.write("Error!\n");
                    console.error(error);
                }
            })

        } else {
            process.stdout.write("Error!\n");
            console.error(error);
        }
    });
}

function getGames(membershipId, characterId, finishedCallback, previousDate, matches, page) {
    // get pages until we can't get anymore
    matches = matches || [];
    page = page || 0;
    var summaryUrl = "http://proxy.guardian.gg/Platform/Destiny/Stats/ActivityHistory/1/"
        + membershipId + "/"
        + characterId + "/?mode=19&definitions=true&count=50"
        + "&page=" + page + "&lc=en";

    request({
        url: summaryUrl,
        json: true
    }, function (error, response, body) {
        if (!error && response.statusCode === 200) {
            if (Object.keys(body.Response.data).length === 0) {
                // we're done!  return what we've got
                finishedCallback(matches);
            } else {
                matches = matches.concat(body.Response.data.activities.map(function (activity) {
                    return {
                        mapName: body.Response.definitions.activities[activity.activityDetails.referenceId].activityName,
                        instanceId: activity.activityDetails.instanceId,
                        gameType: gameModes[activity.activityDetails.mode],
                        date: moment(activity.period)
                    }
                }));

                getGames(membershipId, characterId, finishedCallback, previousDate, matches, ++page);
            }
        } else {
            console.error("Error looking up Trials match summary");
        }
    });
}

function getSummary(membershipId, characters) {
    var matches = [];

    var charsCompleted = 0;

    characters.forEach(function (c, i) {
        getGames(membershipId, c.characterId, function (results) {
            matches = matches.concat(results);
            charsCompleted += 1;
            if (charsCompleted === characters.length) {

                var matchesToFetch = [];
                matches.sort(function(a,b) { return b.date - a.date; })
                    .some(function(m) {
                        if (lastActivityId) {
                            if (m.instanceId !== lastActivityId) {
                                matchesToFetch.push(m);
                            }
                            return m.instanceId === lastActivityId;
                        } else {
                            matchesToFetch.push(m);
                            return false;
                        }
                    });

                pBar = new ProgressBar('Fetching details for :total matches... [:bar] :percent', {
                    complete: '=',
                    incomplete: ' ',
                    width: 30,
                    total: matchesToFetch.length
                });

                if (matchesToFetch.length > 0) {
                    matchesToFetch.forEach(function (match) {
                        gameDoneEmitter.emit("gameStart");
                        getDetails(match);
                    });
                } else {
                    console.log("No new games to fetch.");
                }
            }

        });
    });

}

function saveDetails(games) {
    var gamesStr = JSON.stringify(games, null, 2);
    fs.writeFile(gameFilename, gamesStr, function (err) {
        if (err) throw err;
    });
}

function initMapObject(date, map, aIId) {
    return {
        date: moment(date).format("YYYY-MM-DD"),
        map: map,
        gameType: "",
        activityInstanceId: aIId,
        matchWins: 0,
        matchLosses: 0,
        //matchRatio: 0.0,
        //roundWins: 0,
        //roundLosses: 0,
        //roundRatio: 0.0,
        matchScore: "",
        playerScore: 0,
        playerClass: "",
        playerK: 0,
        playerD: 0,
        playerA: 0,
        playerKD: 0,
        playerKAD: 0,
        whash: "",
        wkills: "",
        wpkills: "",
        gameType: "",
        mCount: 0,
        mNames: "",
        mValues: "",
        mWeights: "",
        pavgKillDist: 0,
        pavgDeathDist: 0,
        pavgLifespan: 0,
        pavgScoreperKill: 0,
        pavgScoreperLife: 0,
        plongestKillSpree: 0,
        plongestLife: 0,
        pSecPlayed: 0,
        pSuicides: 0,
        ptotKillDist: 0,
        wBestType: "",
        wKGrenade: 0,
        wKMelee: 0,
        wKSuper: 0,
        pZonesCaptured: 0,
        pZonesNeutralized: 0,
        psparksCaptured: 0,
        pslamDunks: 0,
        pstyleDunks: 0,
        pdunkKills: 0,
        pcarrierKills: 0,
        ptagCaptures: 0,
        pcapturedYourOwnKill: 0,
        plostTagToOpponent: 0,
        precoveredOwnDeadTag: 0,
        ptagsCapturedPerTagLost: 0
    };
}

function summarize(games) {
    // print out the stats
    var summary = [];
    var currentMap;
    games.forEach(function (g) {
        if (!currentMap) {
            currentMap = initMapObject(g.date, g.map, g.id);
        } else if (currentMap.activityInstanceId !== g.id) {
            // calc the win %, and K/Ds for map
            //currentMap.matchRatio = Math.floor(currentMap.matchRatio * 100) + "%";
            //currentMap.roundRatio = Math.floor(currentMap.roundRatio * 100) + "%";

            var matches = currentMap.matchWins + currentMap.matchLosses;
            currentMap.playerKD = (currentMap.playerKD / matches).toFixed(2).toString();
            currentMap.playerKAD = (currentMap.playerKAD / matches).toFixed(2).toString();

            summary.push(currentMap);
            currentMap = initMapObject(g.date, g.map, g.id);
        }

        var ourTeamName = g.players[userName].teamName;
        var ourTeam = g.teams[ourTeamName],
            enemyTeam;
        if (ourTeamName === "Alpha") {
            enemyTeam = g.teams.Bravo;
        } else {
            enemyTeam = g.teams.Alpha;
        }

        if (ourTeam.result === "Victory") {
            currentMap.matchWins += 1;
            currentMap.matchScore += ourTeam.score.toString() + "v" + enemyTeam.score.toString();
        } else {
            currentMap.matchLosses += 1;
            currentMap.matchScore += enemyTeam.score.toString() + "v" + ourTeam.score.toString();
        }

        //currentMap.roundWins += parseInt(ourTeam.score);
        //currentMap.roundLosses += parseInt(enemyTeam.score);

        //currentMap.matchRatio = currentMap.matchWins / (currentMap.matchWins + currentMap.matchLosses);
        //currentMap.roundRatio = currentMap.roundWins / (currentMap.roundWins + currentMap.roundLosses);

        currentMap.activityInstanceId += g.id;
        currentMap.gameType += g.gameType;
        currentMap.playerScore += g.players[userName].myScore;
        currentMap.playerClass += g.players[userName].myClass;
        currentMap.playerK += g.players[userName].kills;
        currentMap.playerD += g.players[userName].deaths;
        currentMap.playerA += g.players[userName].assists;
        currentMap.playerKD += g.players[userName].kdr;
        currentMap.playerKAD += g.players[userName].kadr;
        currentMap.whash += g.players[userName].weapons.whash;
        currentMap.wkills += g.players[userName].weapons.wkills;
        currentMap.wpkills += g.players[userName].weapons.wpkills;
        currentMap.mCount += g.players[userName].myMedals.mCount;
        currentMap.mNames += g.players[userName].myMedals.mNames;
        currentMap.mValues += g.players[userName].myMedals.mValues;
        currentMap.mWeights += g.players[userName].myMedals.mWeights;
        currentMap.pavgKillDist += g.players[userName].myStats.avgKillDist;
        currentMap.pavgDeathDist += g.players[userName].myStats.avgDeathDist;
        currentMap.pavgLifespan += g.players[userName].myStats.avgLifespan;
        currentMap.pavgScoreperKill += g.players[userName].myStats.avgScorePerKill;
        currentMap.pavgScoreperLife += g.players[userName].myStats.avgScorePerLife;
        currentMap.plongestKillSpree += g.players[userName].myStats.longestKillSpree;
        currentMap.plongestLife += g.players[userName].myStats.longestSingleLife;
        currentMap.pSecPlayed += g.players[userName].myStats.secondsPlayed;
        currentMap.pSuicides += g.players[userName].myStats.suicides;
        currentMap.ptotKillDist += g.players[userName].myStats.totalKillDistance;
        currentMap.wBestType += g.players[userName].myStats.weaponBestType;
        currentMap.wKGrenade += g.players[userName].myStats.weaponKillsGrenade;
        currentMap.wKMelee += g.players[userName].myStats.weaponKillsMelee;
        currentMap.wKSuper += g.players[userName].myStats.weaponKillsSuper;
        currentMap.pZonesCaptured += g.players[userName].myStats.zonesCaptured;
        currentMap.pZonesNeutralized += g.players[userName].myStats.zonesNeutralized;
        currentMap.psparksCaptured += g.players[userName].myStats.sparksCaptured;
        currentMap.pslamDunks += g.players[userName].myStats.slamDunks;
        currentMap.pstyleDunks += g.players[userName].myStats.styleDunks;
        currentMap.pdunkKills += g.players[userName].myStats.dunkKills;
        currentMap.pcarrierKills += g.players[userName].myStats.carrierKills;
        currentMap.ptagCaptures += g.players[userName].myStats.tagCaptures;
        currentMap.pcapturedYourOwnKill += g.players[userName].myStats.capturedYourOwnKill;
        currentMap.plostTagToOpponent += g.players[userName].myStats.lostTagToOpponent;
        currentMap.precoveredOwnDeadTag += g.players[userName].myStats.recoveredOwnDeadTag;
        currentMap.ptagsCapturedPerTagLost += g.players[userName].myStats.tagsCapturedPerTagLost;
    });

    //currentMap.matchRatio = Math.floor(currentMap.matchRatio * 100) + "%";
    //currentMap.roundRatio = Math.floor(currentMap.roundRatio * 100) + "%";

    var matches = currentMap.matchWins + currentMap.matchLosses;
    currentMap.playerKD = (currentMap.playerKD / matches).toFixed(2).toString();
    currentMap.playerKAD = (currentMap.playerKAD / matches).toFixed(2).toString();

    summary.push(currentMap);

    var writer = csv({
        headers: ["Date", "Map", "activityInstanceId", "Matches W", "Matches L", //"Match %", "Rounds W", "Rounds L", "Round %", 
                  "Match Score", "Player Score", "K", "D", "A", "K/D", "K+A/D", "WHash", "WKills", "WPKills", "GameType", "Player Class", 
                  "MCount", "Medal Names", "Medal Values", "Medal Weights", "AvgKillDistance", "AvgDeathDistance", "AvgLifespan", 
                  "AvgScorePerKill", "AvgScorePerLife", "LongestKillSpree", "LongestLife", "SecPlayed", "Suicides", "TotalKillDistance", 
                  "WBestType", "GrenadeKills", "MeleeKills", "SuperKills", "ZonesCaptured", "ZonesNeutralized", "SparksCaptured", 
                  "SlamDunks", "StyleDunks", "DunkKills", "CarrierKills", "TagCaptures", "CapturedYourOwnKill", "LostTagToOpponent", 
                  "RecoveredOwnDeadTag", "TagsCapturedPerTagLost"
        ]
    });

    writer.pipe(fs.createWriteStream("./out/" + userName + ".summary.csv"));
    summary.forEach(function (r) { //r.matchRatio, r.roundWins, r.roundLosses, r.roundRatio,
        writer.write([r.date, r.map, r.activityInstanceId.toString(), r.matchWins, r.matchLosses, r.matchScore, r.playerScore, r.playerK, r.playerD, r.playerA, r.playerKD, r.playerKAD, r.whash, r.wkills, r.wpkills, r.gameType, r.playerClass, r.mCount, r.mNames, r.mValues, r.mWeights, r.pavgKillDist, r.pavgDeathDist, r.pavgLifespan, r.pavgScoreperKill, r.pavgScoreperLife, r.plongestKillSpree, r.plongestLife, r.pSecPlayed, r.pSuicides, r.ptotKillDist, r.wBestType, r.wKGrenade, r.wKMelee, r.wKSuper, r.pZonesCaptured, r.pZonesNeutralized, r.psparksCaptured, r.pslamDunks, r.pstyleDunks, r.pdunkKills, r.pcarrierKills, r.ptagCaptures, r.pcapturedYourOwnKill, r.plostTagToOpponent, r.precoveredOwnDeadTag, r.ptagsCapturedPerTagLost]);
    });
    writer.end();
}

var args = process.argv.slice(2);
if (args.length < 1) {
    console.error("Need to specify a gamertag.");
    process.exit();
}

var userName = args[0];
var gameFilename = "./out/" + userName + ".games.json";
var lastActivityId;
try {
    fs.accessSync(gameFilename, fs.F_OK);
    var prevGames = require(gameFilename);
    var sorted = prevGames.sort(function(a,b) { return b.date - a.date; });
    games = prevGames;
    lastActivityId = sorted[0].id;
} catch (e) {
    console.warn("No previous games found, fetching all games for " + userName + ".");
}

var pBar;

if (!fs.existsSync("./out")) {
    fs.mkdirSync("./out");
}

lookupPlayer(userName);
