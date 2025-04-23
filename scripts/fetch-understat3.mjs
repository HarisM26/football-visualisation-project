import fs from "fs/promises";
import fetch from "node-fetch";

// Extract JSON data from Understat HTML pages 
async function extractUnderstatJSON(html, varName) {
    const re = new RegExp(
        `var\\s+${varName}\\s*=\\s*JSON\\.parse\\('([\\s\\S]*?)'\\);` 
    ); 
    const m = html.match(re); 
    if (!m) throw new Error(`🛑 ${varName} not found`);
    
    // clean up the escaped characters in JSON string
    const raw = m[1]
        .replace(/\\\\/g, "\\")
        .replace(/\\'/g, "'")
        .replace(/\\x([0-9A-Fa-f]{2})/g,
            (_, hex) => String.fromCharCode(parseInt(hex, 16))
        );
    return JSON.parse(raw);
}

// Get player stats for a specific team and season
async function fetchPlayers(season, teamSlug) {
    const url  = `https://understat.com/team/${teamSlug}/${season}`;
    const html = await (await fetch(url)).text();
    return await extractUnderstatJSON(html, "playersData");
}

async function fetchSeasonTotals(season) {
    const leagueHtml = await (await fetch(
        `https://understat.com/league/EPL/${season}`
    )).text();
    const teamsData = await extractUnderstatJSON(leagueHtml, "teamsData");
    const teamsArr = Object.values(teamsData);

    // process each team and collect their stats
    const results = [];
    for (const team of teamsArr) {
        const slug = team.title.replace(/\s+/g, "_");
        const players = await fetchPlayers(season, slug);

        // add up all player stats for the team
        const totals = players.reduce((acc, p) => {
            acc.goals += Number(p.goals);
            acc.xG += Number(p.xG);
            acc.assists += Number(p.assists);
            acc.xA += Number(p.xA);
            return acc;
        }, { goals: 0, xG: 0, assists: 0, xA: 0 });

        results.push({
            team: team.title,
            season: season,
            goals: totals.goals,
            xG: +totals.xG.toFixed(2),
            assists: totals.assists,
            xA: +totals.xA.toFixed(2),
        });
    }

    return results;
}

(async function main() {
    const allSeasons = [];
    for (let s = 2014; s <= 2023; s++) {
        console.log(`Fetching season ${s-1}/${String(s).slice(-2)}…`);
        const seasonTotals = await fetchSeasonTotals(s);
        allSeasons.push(...seasonTotals);
    }

    // save all seasons data to a JSON file
    await fs.writeFile(
        "./understat-epl-totals-2014-24.json",
        JSON.stringify(allSeasons, null, 2)
    );
    console.log("Written json file");
})().catch(err => {
    console.error(err);
    process.exit(1);
});

// need to manually change team names to match csv for now. 