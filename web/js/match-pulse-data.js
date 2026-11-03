/* Event-count analysis only. The source contains no per-attempt xG or coordinates. */
(function () {
  const App = window.App;
  const labels = ["First half", "Second half", "Extra time · first half", "Extra time · second half"];
  const ends = [45, 90, 105, 120], starts = [0, 45, 90, 105];
  function isAttempt(event) {
    return event.type === "shot" || (event.type === "goal" && Boolean(event.body || event.delivery));
  }
  function prepare(match) {
    const periods = (match.aet ? ends : ends.slice(0, 2)).map((end, i) => ({ id: i, name: labels[i], startMinute: starts[i], endMinute: end, observedEnd: end }));
    const events = match.timeline.map((event, index) => {
      const extra = String(event.label || "").match(/^(45|90|105|120)\s*\+\s*(\d+)/);
      const minute = extra ? Number(extra[1]) + Number(extra[2]) : Number(event.min);
      let period = extra ? ends.indexOf(Number(extra[1])) : minute <= 45 ? 0 : minute <= 90 || !match.aet ? 1 : minute <= 105 ? 2 : 3;
      period = Math.min(periods.length - 1, Math.max(0, period));
      periods[period].observedEnd = Math.max(periods[period].observedEnd, minute);
      return { ...event, index, key: `${match.id}:${index}`, minute, period, attempt: isAttempt(event), scoringSide: event.type === "goal" ? event.team : event.type === "own_goal" ? 1 - event.team : null };
    }).filter((event) => Number.isFinite(event.minute));
    let offset = 0;
    for (const period of periods) {
      period.start = offset;
      period.end = offset + period.observedEnd - period.startMinute;
      offset = period.end + 3;
    }
    for (const event of events) event.x = periods[event.period].start + event.minute - periods[event.period].startMinute;
    events.sort((a, b) => a.period - b.period || a.minute - b.minute || a.index - b.index);
    const attempts = events.filter((event) => event.attempt);
    const goals = events.filter((event) => event.scoringSide !== null);
    const counts = [0, 0];
    const cumulative = [0, 1].map((team) => {
      const points = [{ x: 0, count: 0, event: null }];
      for (const event of attempts.filter((event) => event.team === team)) points.push({ x: event.x, count: ++counts[team], event });
      points.push({ x: periods.at(-1).end, count: counts[team], event: null });
      return points;
    });
    const coverage = match.teams.map((team, i) => ({ recorded: counts[i], reported: team.stats.shots, matches: counts[i] === team.stats.shots }));
    const supplementals = goals.filter((event) => event.type === "goal" && !event.attempt);
    return { match, periods, events, attempts, goals, cumulative, coverage, supplementals, end: periods.at(-1).end };
  }
  function select(data, start = 0, end = data.end) {
    const lo = Math.max(0, Math.min(start, end)), hi = Math.min(data.end, Math.max(start, end));
    return { start: lo, end: hi, attempts: data.attempts.filter((e) => e.x >= lo - 1e-8 && e.x <= hi + 1e-8), goals: data.goals.filter((e) => e.x >= lo - 1e-8 && e.x <= hi + 1e-8) };
  }
  function group(events, field) {
    const counts = new Map();
    for (const event of events) {
      let key = field === "outcome" && event.type === "goal" ? "Goal" : event[field] || "Not recorded";
      if (field === "outcome") key = ({ saved: "Saved", blocked: "Blocked", off: "Off target", other: "Other recorded outcome" })[key] || key;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return [...counts].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }
  function clock(data, value) {
    const period = data.periods.find((p) => value >= p.start && value <= p.end) || data.periods.reduce((best, p) => Math.abs(value - p.start) < Math.abs(value - best.start) ? p : best);
    const minute = Math.max(period.startMinute, Math.round(value - period.start + period.startMinute));
    const regular = ends[period.id];
    return minute > regular ? `${regular}+${minute - regular}′` : `${minute}′`;
  }
  function positions(data) {
    return [...new Set([0, ...data.events.map((event) => event.x), ...data.periods.flatMap((period) => [period.start, period.end]), data.end])].sort((a, b) => a - b);
  }
  App.matchPulseData = { prepare, select, group, clock, isAttempt, positions };
})();
