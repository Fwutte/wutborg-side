(function (global) {
  "use strict";

  // Recurring flag days checked against Justitsministeriet's 2026 list:
  // https://www.justitsministeriet.dk/temaer/flagning/flagdage/
  // Later years project these recurring days; special declarations may differ.
  const VERIFIED_FLAG_YEAR = 2026;
  const RULES = [
    {"name":"Nytårsdag","types":["holiday","flag"],"monthDay":"01-01"},
    {"name":"Helligtrekonger","types":["observance"],"monthDay":"01-06"},
    {"name":"Kyndelmisse","types":["observance"],"monthDay":"02-02"},
    {"name":"Dronning Marys fødselsdag","types":["flag"],"monthDay":"02-05"},
    {"name":"Prinsesse Maries fødselsdag","types":["flag"],"monthDay":"02-06"},
    {"name":"Valentinsdag","types":["observance"],"monthDay":"02-14"},
    {"name":"Fastelavn","types":["observance"],"easterOffset":-49},
    {"name":"Kvindernes internationale kampdag","types":["observance"],"monthDay":"03-08"},
    {"name":"Palmesøndag","types":["observance"],"easterOffset":-7},
    {"name":"Aprilsnar","types":["observance"],"monthDay":"04-01"},
    {"name":"Skærtorsdag","types":["holiday"],"easterOffset":-3},
    {"name":"Langfredag","types":["holiday","flag"],"note":"Der flages på halv stang hele dagen.","easterOffset":-2},
    {"name":"Påskedag","types":["holiday","flag"],"easterOffset":0},
    {"name":"2. påskedag","types":["holiday"],"easterOffset":1},
    {"name":"Besættelsesdagen","types":["observance","flag"],"note":"Halv stang til kl. 12, derefter hel stang.","monthDay":"04-09"},
    {"name":"Dronning Margrethes fødselsdag","types":["flag"],"monthDay":"04-16"},
    {"name":"Prinsesse Isabellas fødselsdag","types":["flag"],"monthDay":"04-21"},
    {"name":"Prinsesse Benediktes fødselsdag","types":["flag"],"monthDay":"04-29"},
    {"name":"Arbejdernes internationale kampdag","types":["observance"],"monthDay":"05-01"},
    {"name":"Befrielsesbudskabet · lys i vinduerne","types":["observance"],"monthDay":"05-04"},
    {"name":"Befrielsesdagen","types":["observance","flag"],"monthDay":"05-05"},
    {"name":"Mors dag","types":["observance"],"sunday":[5,2]},
    {"name":"Kristi himmelfartsdag","types":["holiday","flag"],"easterOffset":39},
    {"name":"Pinsedag","types":["holiday","flag"],"easterOffset":49},
    {"name":"2. pinsedag","types":["holiday"],"easterOffset":50},
    {"name":"Kong Frederik X's fødselsdag","types":["flag"],"monthDay":"05-26"},
    {"name":"Grundlovsdag","types":["observance","flag"],"monthDay":"06-05"},
    {"name":"Fars dag","types":["observance"],"monthDay":"06-05"},
    {"name":"Prins Joachims fødselsdag","types":["flag"],"monthDay":"06-07"},
    {"name":"Valdemarsdag og genforeningsdag","types":["observance","flag"],"monthDay":"06-15"},
    {"name":"Grønlands nationaldag","types":["flag"],"flag":"greenland","monthDay":"06-21"},
    {"name":"Sankt Hans aften","types":["observance"],"monthDay":"06-23"},
    {"name":"Færøernes nationale festdag · Ólavsøka","types":["flag"],"flag":"faroe","monthDay":"07-29"},
    {"name":"Danmarks udsendte","types":["flag"],"monthDay":"09-05"},
    {"name":"Kronprins Christians fødselsdag","types":["flag"],"monthDay":"10-15"},
    {"name":"Halloween","types":["observance"],"monthDay":"10-31"},
    {"name":"Allehelgensdag","types":["observance"],"sunday":[11,1]},
    {"name":"Mortensaften","types":["observance"],"monthDay":"11-10"},
    {"name":"1. søndag i advent","types":["observance"],"adventWeek":1},
    {"name":"2. søndag i advent","types":["observance"],"adventWeek":2},
    {"name":"3. søndag i advent","types":["observance"],"adventWeek":3},
    {"name":"Luciadag","types":["observance"],"monthDay":"12-13"},
    {"name":"4. søndag i advent","types":["observance"],"adventWeek":4},
    {"name":"Juleaften","types":["observance"],"monthDay":"12-24"},
    {"name":"Juledag","types":["holiday","flag"],"monthDay":"12-25"},
    {"name":"2. juledag","types":["holiday"],"monthDay":"12-26"},
    {"name":"Nytårsaften","types":["observance"],"monthDay":"12-31"}
  ];

  function easter(year) {
    // Gregorian computus (Meeus/Jones/Butcher).
    const a = year % 19, b = Math.floor(year / 100), c = year % 100;
    const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4), k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const n = h + l - 7 * m + 114;
    return new Date(Date.UTC(year, Math.floor(n / 31) - 1, n % 31 + 1));
  }

  function shift(date, days) {
    const result = new Date(date);
    result.setUTCDate(result.getUTCDate() + days);
    return result;
  }

  function isValidMonthDay(year, monthDay) {
    if (!/^\d{2}-\d{2}$/.test(monthDay)) return false;
    const date = new Date(`${year}-${monthDay}T00:00:00Z`);
    return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === `${year}-${monthDay}`;
  }

  function publicEvents(year) {
    const easterDay = easter(year);
    const christmas = new Date(Date.UTC(year, 11, 25));
    const fourthAdvent = shift(christmas, -(christmas.getUTCDay() || 7));
    return RULES.map(({ monthDay, easterOffset, sunday, adventWeek, ...event }) => {
      let date;
      if (easterOffset !== undefined) date = shift(easterDay, easterOffset);
      else if (sunday) {
        const first = new Date(Date.UTC(year, sunday[0] - 1, 1));
        date = shift(first, (7 - first.getUTCDay()) % 7 + (sunday[1] - 1) * 7);
      } else if (adventWeek) date = shift(fourthAdvent, (adventWeek - 4) * 7);
      else date = new Date(`${year}-${monthDay}T00:00:00Z`);
      return { ...event, types: [...event.types], date: date.toISOString().slice(0, 10) };
    }).sort((left, right) => left.date.localeCompare(right.date));
  }

  function visibleEvents(events, activeFilters) {
    return events.filter(event => event.types.some(type => activeFilters.has(type)));
  }

  global.WutborgCalendar = { publicEvents, easter, isValidMonthDay, visibleEvents, VERIFIED_FLAG_YEAR };
})(typeof window !== "undefined" ? window : globalThis);
