/* Pure rules shared by rendering and behavior tests. Dates use calendar days. */
const PrepperModel = (() => {
  const number = new Intl.NumberFormat("da-DK", { maximumFractionDigits: 2 });
  const today = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
  };
  const addDays = (date, days) => {
    const value = new Date(date.slice(0, 10) + "T12:00:00Z");
    value.setUTCDate(value.getUTCDate() + days);
    return value.toISOString().slice(0, 10);
  };
  const unit = (amount, value = "") => amount === 1 ? ({ pakker:"pakke", dåser:"dåse", flasker:"flaske", ruller:"rulle", poser:"pose", portioner:"portion", sedler:"seddel" }[value] || value) : value;
  const quantity = (amount, value = "") => amount == null ? "Ikke optalt" : `${number.format(amount)} ${unit(amount, value)}`.trim();
  const dateLabel = value => new Intl.DateTimeFormat("da-DK", { day:"numeric", month:"short", year:"numeric" }).format(new Date(value.slice(0,10) + "T12:00:00Z"));
  function status(item, date = today()) {
    const hasGoal = item.target_amount != null && item.target_amount > 0;
    const uncounted = hasGoal && item.amount == null;
    const missing = hasGoal && item.amount != null ? Math.max(0, Math.round((item.target_amount - item.amount) * 100) / 100) : 0;
    const empty = item.amount === 0;
    const nextCheck = item.review_days && item.checked_at ? addDays(item.checked_at, item.review_days) : null;
    const overdue = Boolean(item.review_days && item.is_ready && (!nextCheck || nextCheck <= date));
    const datePassed = Boolean(item.expires_on && item.expires_on < date);
    const dateSoon = Boolean(item.expires_on && !datePassed && item.expires_on <= addDays(date, 30));
    const ready = Boolean(item.is_ready && !uncounted && !missing && !empty && !overdue && !datePassed);
    const attention = overdue || datePassed || dateSoon;
    let reason = "Mangler klargøring";
    if (datePassed) reason = "Dato passeret · gennemgå varen";
    else if (overdue) reason = "Tid til at kontrollere igen";
    else if (uncounted) reason = "Tæl beholdningen op";
    else if (missing) reason = `Mangler ${quantity(missing, item.unit)}`;
    else if (empty) reason = "Tomt på lager";
    else if (ready) reason = "Klar";
    return { ready, missing, uncounted, nextCheck, overdue, datePassed, dateSoon, attention, reason };
  }
  function summary(items, date = today()) {
    const states = items.map(item => status(item, date));
    const water = items.filter(item => item.category === "Vand" && /^(liter|l)$/i.test(item.unit.trim()));
    return {
      ready: states.filter(item => item.ready).length,
      attention: states.filter(item => item.attention).length,
      waterAmount: water.some(item => item.amount != null) ? water.reduce((sum,item) => sum + (item.amount || 0), 0) : null,
      waterTarget: water.some(item => item.target_amount != null) ? water.reduce((sum,item) => sum + (item.target_amount || 0), 0) : null,
      waterUncounted: water.filter(item => item.amount == null).length,
    };
  }
  return { status, summary, quantity, unit, today, dateLabel };
})();
