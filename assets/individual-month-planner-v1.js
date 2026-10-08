"use strict";

// Individuelle 8-Stunden-Monatsplanung. Verbindliche Rhythmen bleiben im bisherigen Optimierer.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;else root.SFIndividualMonthPlanner = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const DAY = 86400000,
    HOUR = 3600000;
  const day = d => Math.floor(Date.parse(d + 'T12:00:00Z') / DAY);
  const date = n => new Date(n * DAY).toISOString().slice(0, 10);
  const week = d => {
    const n = day(d),
      dow = new Date(d + 'T12:00:00Z').getUTCDay() || 7;
    return n - dow + 1;
  };
  function duty(a) {
    const s = new Date(a.date + 'T' + a.start.slice(0, 5) + ':00'),
      end = new Date(a.date + 'T' + a.end.slice(0, 5) + ':00');
    if (end <= s) end.setDate(end.getDate() + 1);
    return {
      ...a,
      day: day(a.date),
      startMs: +s,
      endMs: +end,
      hours: (end - s) / HOUR,
      rank: Number(a.start.slice(0, 2)) * 60 + Number(a.start.slice(3, 5)),
      night: a.start >= '20:00',
      morning: a.type === 'FD-WE'
    };
  }
  const rng = seed => () => {
    seed = Math.imul(seed, 1664525) + 1013904223 >>> 0;
    return seed / 4294967296;
  };
  function prepare(input) {
    const start = day(input.month + '-01'),
      count = new Date(Number(input.month.slice(0, 4)), Number(input.month.slice(5)), 0).getDate(),
      end = start + count - 1;
    const employees = input.employees.map(e => ({
        ...e,
        maxConsecutive: Math.min(5, e.maxConsecutive || 5)
      })),
      base = input.base.map(duty).filter(a => a.day >= start - 7 && a.day <= end + 7),
      capacity = new Map(input.capacities),
      options = new Map(employees.map(e => [String(e.id), new Map()]));
    for (const g of input.groups) {
      const own = options.get(String(g.employee.id));
      if (!own) continue;
      for (const list of g.options) for (const a of list) {
        const d = duty(a),
          rows = own.get(d.day) || [];
        if (!rows.some(x => x.resource === d.resource && x.type === d.type)) rows.push(d);
        own.set(d.day, rows);
      }
    }
    const existingCounts = new Map();
    for (const a of base.filter(a => a.day >= start && a.day <= end)) {
      const key = a.resource || a.date + '|' + a.type;
      existingCounts.set(key, (existingCounts.get(key) || 0) + 1);
    }
    const morningBase = new Map(employees.map(e => [String(e.id), base.filter(a => String(a.employeeId) === String(e.id) && a.day >= start && a.day <= end && a.morning).length])),
      morningSlots = [...morningBase.values()].reduce((n, v) => n + v, 0) + [...capacity].filter(([k]) => k.endsWith('|FD-WE')).reduce((n, [, v]) => n + v, 0),
      morningPeople = employees.filter(e => [...options.get(String(e.id)).values()].some(rows => rows.some(a => a.morning))),
      totalTarget = morningPeople.reduce((n, e) => n + e.target, 0);
    const morningBounds = new Map(morningPeople.map(e => {
      const share = morningSlots * e.target / Math.max(1, totalTarget),
        locked = morningBase.get(String(e.id)) || 0,
        available = locked + [...options.get(String(e.id)).values()].filter(rows => rows.some(a => a.morning)).length,
        min = Math.min(morningSlots >= morningPeople.length * 2 ? 2 : Math.min(Math.floor(share), 2), available);
      return [String(e.id), {
        min,
        max: Math.min(available, Math.max(locked, min, Math.ceil(share))),
        goal: min,
        share
      }];
    }));
    let unallocated = morningSlots - [...morningBounds.values()].reduce((n, b) => n + b.goal, 0);
    while (unallocated > 0) {
      const next = [...morningBounds.values()].filter(b => b.goal < b.max).sort((a, b) => b.share - b.goal - (a.share - a.goal))[0];
      if (!next) break;
      next.goal++;
      unallocated--;
    }
    return {
      ...input,
      start,
      end,
      count,
      employees,
      base,
      capacity,
      existingCounts,
      options,
      morningBounds
    };
  }
  function personValid(p, e, plan) {
    const own = [...p.base.filter(a => String(a.employeeId) === String(e.id)), ...plan.map(duty)].sort((a, b) => a.day - b.day || a.startMs - b.startMs),
      seen = new Set(),
      weeks = new Map();
    let hours = 0;
    for (let i = 0; i < own.length; i++) {
      const a = own[i];
      if (seen.has(a.day)) return false;
      seen.add(a.day);
      weeks.set(week(a.date), (weeks.get(week(a.date)) || 0) + a.hours);
      if (a.day >= p.start && a.day <= p.end) hours += a.hours;
      if (i) {
        const b = own[i - 1];
        if (a.startMs - b.endMs < 11 * HOUR) return false;
        if (a.day === b.day + 1 && a.rank < b.rank) return false;
      }
    }
    if (hours > e.monthLimit + .00001 || own.filter(a=>a.day>=p.start&&a.day<=p.end).length>(e.maxMonthlyShifts??Infinity)) return false;
    if (p.respectHours && e.weeklyLimit > 0) for (const [w, h] of weeks) if (w <= p.end && w + 6 >= p.start && h > e.weeklyLimit + .00001) return false;
    const blocks = [];
    for (const a of own) {
      if (blocks.length && blocks.at(-1).at(-1).day + 1 === a.day) blocks.at(-1).push(a);else blocks.push([a]);
    }
    for (const block of blocks) {
      if (!block.some(a => a.day >= p.start && a.day <= p.end)) continue;
      if (block.length > e.maxConsecutive) return false;
      if (block.length === 1 && block[0].day < p.end && block[0].day >= p.start) return false;
    }
    const nights = [];
    for (const a of own.filter(a => a.night)) {
      if (nights.length && nights.at(-1).at(-1).day + 1 === a.day) nights.at(-1).push(a);else nights.push([a]);
    }
    for (const block of nights) {
      if (block.some(a => a.day >= p.start && a.day <= p.end) && (block.length < 2 || block.length > 4)) return false;
      if (block[0].day > p.end + 1 || block.at(-1).day < p.start - 3) continue;
      if (seen.has(block[0].day - 1)) return false;
      for (let offset = 1; offset <= 3; offset++) if (seen.has(block.at(-1).day + offset)) return false;
    }
    return true;
  }
  function validate(input, preview) {
    if (!Array.isArray(preview)) return false;
    const p = prepare(input),
      used = new Map();
    for (const a of preview) {
      if (!a || typeof a.date !== 'string' || !a.date.startsWith(p.month + '-') || !['FD-WE', 'SD', 'ND'].includes(a.type) || !/^\d{2}:\d{2}$/.test(a.start) || !/^\d{2}:\d{2}$/.test(a.end)) return false;
      const e = p.employees.find(e => String(e.id) === String(a.employeeId));
      if (!e || !(p.options.get(String(e.id)).get(day(a.date)) || []).some(x => x.type === a.type && x.resource === a.resource && x.start === a.start && x.end === a.end)) return false;
      used.set(a.resource, (used.get(a.resource) || 0) + 1);
    }
    for (const [key, n] of used) if (n > (p.capacity.get(key) || 0)) return false;
    return p.employees.every(e => personValid(p, e, preview.filter(a => String(a.employeeId) === String(e.id))));
  }
  function score(p, plans) {
    const used = new Map(),
      counts = new Map();
    let deficit = 0,
      extra = 0,
      shape = 0,
      morningMissing = 0;
    for (const e of p.employees) {
      const own = [...p.base.filter(a => String(a.employeeId) === String(e.id) && a.day >= p.start && a.day <= p.end), ...(plans.get(String(e.id)) || [])],
        hours = own.reduce((n, a) => n + a.hours, 0),
        missing = Math.max(0, e.target - hours);
      deficit += missing;
      extra += Math.max(0, hours - e.target);
      shape += missing * missing / Math.max(1, e.target);
      const morning = own.filter(a => a.morning).length,
        bounds = p.morningBounds.get(String(e.id));
      if (bounds) {
        morningMissing += Math.max(0, bounds.min - morning);
        shape += Math.max(0, morning - bounds.max) * 100 + Math.abs(morning - bounds.goal) * 10;
      }
      shape += Math.abs(own.filter(a => a.type === 'SD').length - own.filter(a => a.type === 'ND').length) * 2;
      for (const a of plans.get(String(e.id)) || []) {
        used.set(a.resource, (used.get(a.resource) || 0) + 1);
        counts.set(a.resource, (counts.get(a.resource) || 0) + 1);
      }
    }
    let open = 0,
      thin = 0,
      morningOpen = 0;
    for (const [key, n] of p.capacity) {
      const remaining = n - (used.get(key) || 0);
      open += remaining;
      if (key.endsWith('|FD-WE')) morningOpen += remaining;
      if (/\|(SD|ND)$/.test(key)) thin += Math.max(0, Math.min(n, Math.max(0, 4 - (p.existingCounts.get(key) || 0))) - (counts.get(key) || 0)) ** 2;
    }
    return {
      open,
      deficit,
      extra,
      shape,
      morningOpen,
      morningMissing,
      thin,
      value: open * 1000 + deficit * 5 + shape + thin * 10000 + morningOpen * 10000 + morningMissing * 2000
    };
  }
  function searchPerson(p, e, remaining, random, beamWidth) {
    const ownBase = p.base.filter(a => String(a.employeeId) === String(e.id)),
      locked = new Map(ownBase.filter(a => a.day >= p.start && a.day <= p.end).map(a => [a.day, a])),
      outside = ownBase.filter(a => a.day < p.start || a.day > p.end),
      outsideWeeks = new Map();
    for (const a of outside) outsideWeeks.set(week(a.date), (outsideWeeks.get(week(a.date)) || 0) + a.hours);
    const prior = outside.find(a => a.day === p.start - 1),
      previous = outside.filter(a => a.day < p.start).sort((a,b) => b.day-a.day)[0],
      priorFree = previous ? Math.min(3, p.start - previous.day - 1) : 3;
    let run = 0,
      nightRun = 0;
    if (prior) {
      for (let d = prior.day; outside.some(a => a.day === d); d--) run++;
      if (prior.night) for (let d = prior.day; outside.some(a => a.day === d && a.night); d--) nightRun++;
    }
    let beam = [{
        hours: 0,
        monthDuties: 0,
        weekHours: outsideWeeks.get(week(date(p.start))) || 0,
        last: prior || null,
        run,
        nightRun,
        mornings: 0,
        nights: 0,
        free: priorFree,
        recovery: prior ? 0 : previous?.night ? Math.max(0, 3-priorFree) : 0,
        score: 0,
        parent: null,
        added: null
      }],
      bounds = p.morningBounds.get(String(e.id));
    // Dominance keeps the strongest path for each equivalent hours/week/block state.
    const noise = Array.from({
      length: p.count
    }, () => [random() * 9, random() * 9, random() * 9, random() * 9]);
    for (let i = 0; i < p.count; i++) {
      const d = p.start + i,
        w = week(date(d)),
        next = new Map(),
        isLocked = locked.has(d),
        choices = isLocked ? [locked.get(d)] : [null, ...(p.options.get(String(e.id)).get(d) || []).filter(a => (remaining.get(a.resource) || 0) > 0)];
      for (const node of beam) for (const a of choices) {
        const weekly = i && w !== week(date(d - 1)) ? outsideWeeks.get(w) || 0 : node.weekHours;
        if (!a) {
          if (i > 0 && (node.run === 1 || node.nightRun === 1)) continue;
          const n = {
            ...node,
            weekHours: weekly,
            last: null,
            run: 0,
            nightRun: 0,
            free: Math.min(3, node.free + 1),
            recovery: node.nightRun ? 2 : Math.max(0,node.recovery-1),
            score: node.score + (node.free === 1 ? 2 : 0),
            parent: node,
            added: null
          };
          keep(n);
          continue;
        }
        if (node.monthDuties + 1 > (e.maxMonthlyShifts??Infinity) || node.hours + a.hours > e.monthLimit + .00001 || p.respectHours && e.weeklyLimit > 0 && weekly + a.hours > e.weeklyLimit + .00001) continue;
        if (node.recovery > 0 || a.night && !node.nightRun && node.free < 1) continue;
        if (node.last && (a.startMs - node.last.endMs < 11 * HOUR || a.rank < node.last.rank)) continue;
        if (node.nightRun === 1 && !a.night) continue;
        const workRun = node.run + 1,
          nr = a.night ? node.nightRun + 1 : 0;
        if (workRun > e.maxConsecutive || nr > 4) continue;
        const morning = node.mornings + Number(a.morning);
        if (bounds && morning > bounds.max) continue;
        const available = remaining.get(a.resource) || 0,
          cap = p.capacity.get(a.resource) || 1;
        const bonus = (a.morning ? node.mornings < (bounds?.goal || 0) ? 35 : -15 : 0) + (node.last?.type === a.type ? 3 : -2) + (node.free >= 2 ? 2 : 0) + available / cap * 6 + (a.morning ? 35 : available > Math.max(0, cap - Math.max(0, 4 - (p.existingCounts.get(a.resource) || 0))) ? 30 : -20) + (p.prices?.get(a.resource) || 0) + noise[i][a.morning ? 0 : a.night ? 2 : 1];
        keep({
          hours: node.hours + a.hours,
          monthDuties: node.monthDuties + 1,
          weekHours: weekly + a.hours,
          last: a,
          run: workRun,
          nightRun: nr,
          mornings: morning,
          nights: node.nights + Number(a.night),
          free: 0,
          recovery: 0,
          score: node.score + 100 + a.hours + bonus,
          parent: node,
          added: isLocked ? null : a
        });
      }
      function keep(n) {
        const key = [n.hours, n.weekHours, n.last?.type || '', n.run, n.nightRun, n.mornings, n.nights, n.free, n.recovery].join('|'),
          old = next.get(key);
        if (!old || n.score > old.score) next.set(key, n);
      }
      beam = [...next.values()].sort((a, b) => b.score - a.score).slice(0, beamWidth);
      if (!beam.length) return null;
    }
    const following = outside.find(a => a.day === p.end + 1);
    let best = null,
      bestScore = -Infinity;
    for (const node of beam) {
      if (node.nightRun === 1 && !following?.night) continue;
      const s = node.score - (bounds ? Math.max(0, bounds.min - node.mornings) * 300 : 0) - Math.abs(node.nights - (node.hours / 8 - node.mornings - node.nights)) * 2;
      if (s <= bestScore) continue;
      const plan = [];
      for (let n = node; n?.parent; n = n.parent) if (n.added) plan.push(n.added);
      plan.reverse();
      if (!personValid(p, e, plan)) continue;
      best = plan;
      bestScore = s;
    }
    return best;
  }
  function improve(p, plans) {
    let quality = score(p, plans);
    for (let pass = 0; pass < 3; pass++) {
      let chosen = null,
        chosenQuality = quality;
      const used = new Map();
      for (const plan of plans.values()) for (const a of plan) used.set(a.resource, (used.get(a.resource) || 0) + 1);
      for (const e of p.employees) {
        const id = String(e.id),
          own = plans.get(id) || [];
        for (const [d, choices] of p.options.get(id)) for (const a of choices) {
          if ((used.get(a.resource) || 0) >= (p.capacity.get(a.resource) || 0)) continue;
          const prior = own.find(x => x.day === d);
          if (prior?.type === a.type) continue;
          const replacement = [...own.filter(x => x.day !== d), a].sort((a, b) => a.day - b.day);
          if (!personValid(p, e, replacement)) continue;
          const trial = new Map(plans);
          trial.set(id, replacement);
          const q = score(p, trial);
          if (q.value < chosenQuality.value) {
            chosen = trial;
            chosenQuality = q;
          }
        }
      }
      // Add or change two adjacent duties together, preserving minimum work/night blocks.
      for (const e of p.employees) {
        const id = String(e.id),
          own = plans.get(id) || [],
          options = p.options.get(id);
        for (let d = p.start; d < p.end; d++) for (const a of options.get(d) || []) for (const b of options.get(d + 1) || []) {
          const oldA = own.find(x => x.day === d),
            oldB = own.find(x => x.day === d + 1);
          if (oldA?.type === a.type && oldB?.type === b.type) continue;
          if ((used.get(a.resource) || 0) - Number(oldA?.resource === a.resource) + 1 > (p.capacity.get(a.resource) || 0) || (used.get(b.resource) || 0) - Number(oldB?.resource === b.resource) + 1 > (p.capacity.get(b.resource) || 0)) continue;
          const replacement = [...own.filter(x => x.day !== d && x.day !== d + 1), a, b].sort((a, b) => a.day - b.day);
          if (!personValid(p, e, replacement)) continue;
          const trial = new Map(plans);
          trial.set(id, replacement);
          const q = score(p, trial);
          if (q.value < chosenQuality.value) {
            chosen = trial;
            chosenQuality = q;
          }
        }
      }
      // Equal-date swaps free scarce morning positions without changing personal hours.
      for (let i = 0; i < p.employees.length; i++) for (let j = i + 1; j < p.employees.length; j++) {
        const e = p.employees[i],
          f = p.employees[j],
          id = String(e.id),
          other = String(f.id),
          one = plans.get(id) || [],
          two = plans.get(other) || [];
        for (const a of one) {
          const b = two.find(x => x.day === a.day && x.type !== a.type);
          if (!b) continue;
          const ca = (p.options.get(id).get(a.day) || []).find(x => x.type === b.type),
            cb = (p.options.get(other).get(a.day) || []).find(x => x.type === a.type);
          if (!ca || !cb) continue;
          const x = one.map(d => d === a ? ca : d),
            y = two.map(d => d === b ? cb : d);
          if (!personValid(p, e, x) || !personValid(p, f, y)) continue;
          const trial = new Map(plans);
          trial.set(id, x);
          trial.set(other, y);
          const q = score(p, trial);
          if (q.value < chosenQuality.value) {
            chosen = trial;
            chosenQuality = q;
          }
        }
      }
      if (!chosen) break;
      plans = chosen;
      quality = chosenQuality;
    }
    return {
      plans,
      quality
    };
  }
  async function optimize(input, {
    iterations = 128,
    beamWidth = 160,
    yieldStep = () => Promise.resolve(),
    progress = () => {}
  } = {}) {
    // A seeded plan is retained as the best candidate while independent restarts explore changes.
    const p = prepare(input),
      random = rng(20270104);
    let best = null,
      bestQuality = null,
      current = null,
      currentQuality = null;
    if (input.seed?.length && validate(input, input.seed)) {
      best = new Map(p.employees.map(e => [String(e.id), input.seed.filter(a => String(a.employeeId) === String(e.id)).map(duty)]));
      bestQuality = score(p, best);
      current = best;
      currentQuality = bestQuality;
    }
    for (let iteration = 0; iteration < iterations; iteration++) {
      let plans = new Map();
      const retained = current && iteration >= 4 && iteration % 16 !== 0 ? new Set(p.employees.filter(() => random() > .35 - iteration % 4 * .05).map(e => String(e.id))) : new Set();
      if (current) for (const id of retained) plans.set(id, current.get(id) || []);
      const remaining = new Map(p.capacity);
      for (const plan of plans.values()) for (const a of plan) remaining.set(a.resource, remaining.get(a.resource) - 1);
      // Price scarce dates to prevent surplus on one day while another falls short.
      p.prices = new Map();
      if (best) {
        const used = new Map();
        for (const plan of best.values()) for (const a of plan) used.set(a.resource, (used.get(a.resource) || 0) + 1);
        for (const [key, n] of p.capacity) {
          const have = used.get(key) || 0;
          p.prices.set(key, key.endsWith('|FD-WE') ? (n - have) * 35 : Math.max(0, Math.min(n, Math.max(0, 4 - (p.existingCounts.get(key) || 0))) - have) * 25);
        }
      }
      const order = p.employees.filter(e => !retained.has(String(e.id))).map(e => ({
        e,
        tie: random(),
        boundary: p.base.filter(a => String(a.employeeId) === String(e.id) && a.day >= week(date(p.start)) && a.day < p.start).length
      })).sort((a, b) => iteration % 3 === 0 ? b.boundary - a.boundary || b.e.target - a.e.target || a.tie - b.tie : a.tie - b.tie);
      for (const {
        e
      } of order) {
        const plan = searchPerson(p, e, remaining, random, beamWidth);
        if (plan) {
          plans.set(String(e.id), plan);
          for (const a of plan) remaining.set(a.resource, remaining.get(a.resource) - 1);
        } else plans.set(String(e.id), []);
        await yieldStep();
      }
      const preview = [...plans.values()].flat();
      if (validate(input, preview)) {
        let q = score(p, plans);
        if (!bestQuality || q.value < bestQuality.value) {
          const refined = improve(p, plans);
          plans = refined.plans;
          q = refined.quality;
          best = plans;
          bestQuality = q;
        } // Exploration may temporarily accept a worse search state; only the best validated plan is returned.
        const temperature = 12000 * (1 - iteration / iterations) + 500;
        if (!currentQuality || q.value < currentQuality.value || random() < Math.exp((currentQuality.value - q.value) / temperature)) {
          current = plans;
          currentQuality = q;
        }
      }
      progress({
        iteration: iteration + 1,
        iterations,
        open: bestQuality?.open ?? [...p.capacity.values()].reduce((n, x) => n + x, 0),
        deficit: bestQuality?.deficit ?? 0,
        individual: true
      });
      await yieldStep();
    }
    if (!best) throw Error('Unter den aktuellen Vorgaben wurde kein gültiger individueller Monatsplan gefunden.');
    const preview = [];
    for (const [id, plan] of best) {
      let start = null,
        previous = null;
      for (const a of [...plan].sort((a, b) => a.day - b.day)) {
        if (!previous || a.day !== previous.day + 1) start = a.date;
        preview.push({
          ...a,
          blockId: 'individual-' + id + '|' + start
        });
        previous = a;
      }
    }
    return {
      preview,
      quality: bestQuality,
      rows: p.employees.map(e => {
        const hours = [...p.base.filter(a => String(a.employeeId) === String(e.id) && a.day >= p.start && a.day <= p.end), ...(best.get(String(e.id)) || [])].reduce((n, a) => n + a.hours, 0);
        return {
          employeeId: e.id,
          target: e.target,
          planned: hours,
          missing: Math.max(0, e.target - hours),
          extra: Math.max(0, hours - e.target)
        };
      })
    };
  }
  return {
    optimize,
    validate,
    prepare,
    personValid,
    duty,
    score
  };
});
