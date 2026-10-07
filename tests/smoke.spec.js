const { test, expect } = require("@playwright/test");
const { TODAY, day, fixture, open } = require("./helpers");

const TABS = { today: "Главное на сегодня", plan: "Баланс сфер", prayer: "Молитвенные нужды", sleep: "Календарь подъёмов", results: "Неделя" };

for (const [hash, heading] of Object.entries(TABS)) {
  test(`вкладка #${hash} открывается без ошибок и без горизонтальной прокрутки`, async ({ page }) => {
    const { errors } = await open(page, { hash });
    await expect(page.locator(`.view[data-view="${hash}"] h2`, { hasText: heading }).first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    expect(errors).toEqual([]);
  });
}

test("итоги месяца открываются из «Итогов», листаются назад и не дают горизонтальной прокрутки", async ({ page }) => {
  const { errors } = await open(page, { hash: "results" });
  await page.locator("#month-link").click();
  await expect(page.locator("#m-label")).toHaveText("Октябрь 2026");
  await expect(page.locator("#m-strip .ms-row")).toHaveCount(6);
  await expect(page.locator(".side-nav a[aria-current], .tabs a[aria-current], [data-nav] a[aria-current]").first()).toHaveAttribute("href", "#results");
  await page.locator("#m-prev").click();
  await expect(page.locator("#m-label")).toHaveText("Сентябрь 2026");
  await expect(page.locator("#m-prev")).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  expect(errors).toEqual([]);
});

test("старые адреса вкладок открывают новые", async ({ page }) => {
  await open(page, { hash: "morning" });
  await expect(page.locator('.view[data-view="sleep"]')).toBeVisible();
  await page.goto("/#goals");
  await expect(page.locator('.view[data-view="plan"]')).toBeVisible();
});

test("отметка привычки сохраняется в GitHub", async ({ page }) => {
  const { puts } = await open(page);
  await page.locator('#today-list button[data-hid="read"]').click();
  await expect.poll(() => puts.at(-1)?.log?.[TODAY]?.read).toBe(true);
});

test("фокус: нажатие добавляет дело в главное, повторное — убирает", async ({ page }) => {
  const { puts } = await open(page);
  const pick = page.locator("#bal-rec button.pi").first();
  const title = (await pick.locator("span").first().evaluate(el => el.firstChild.textContent)).trim();
  await pick.click();
  await expect(pick).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#focus-list")).toContainText(title);
  await pick.click();
  await expect(pick).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#focus-list")).not.toContainText(title);
  await expect.poll(() => (puts.at(-1)?.focus?.[TODAY] || []).length).toBe(0);
});

test("задачи из «Когда-нибудь» не предлагаются", async ({ page }) => {
  await open(page);
  const seen = new Set();
  const more = page.locator("#bal-rec [data-bmore]");
  if (await more.count()) await more.click();
  for (const alt of await page.locator("#bal-rec [data-balt]").all()) {
    for (let i = 0; i < 4; i++) {
      (await page.locator("#bal-rec button.pi").allInnerTexts()).forEach(t => seen.add(t));
      await alt.click();
    }
  }
  expect([...seen].join("\n")).not.toContain("море");
  await page.locator('#focus-list [data-open-wizard="focus"]').click();
  await expect(page.locator("#sheet-body")).toContainText("Подарить жене цветы");
  await expect(page.locator("#sheet-body")).not.toContainText("море");
});

test("подзадачи показываются под своей задачей", async ({ page }) => {
  await open(page);
  const list = page.locator("#plan-tasks");
  await expect(list.locator("li.pt-head", { hasText: "Детская комната" })).toBeVisible();
  await expect(list.locator("li.pt.sub", { hasText: "Покрасить стену" })).toBeVisible();
  await expect(list.locator("li.pt.par", { hasText: "Подготовить машину к зиме" })).toContainText("подзадачи: 1 из 3");
  await expect(list.locator("li.pt.sub", { hasText: "Купить зимнюю резину" })).toBeVisible();
});

test("на «Сегодня» видна одна карточка «Сейчас»", async ({ page }) => {
  const now = () => page.locator("#pray-card, #ritual-card, #slot-card").evaluateAll(els => els.filter(e => !e.hidden).map(e => e.id));
  await open(page, { time: "10:00" });
  expect(await now()).toEqual(["pray-card"]);
  await page.clock.setFixedTime(`${TODAY}T21:00:00+03:00`);
  await page.reload();
  await page.locator("#main").waitFor({ state: "visible" });
  expect(await now()).toEqual(["slot-card"]);
});

test("сфера списка важнее слов в названии задачи", async ({ page }) => {
  const data = fixture();
  data.settings.listSpheres = { "Семья": "жена" };
  await open(page, { hash: "plan", data });
  await page.locator("#bal-tags summary").click();
  await expect(page.locator('#bal-tags select[data-tag="p2"]')).toHaveValue("жена");
  await page.locator("#bal-lists summary").click();
  await expect(page.locator('#bal-lists select[data-list="Когда-нибудь/может быть"]')).toHaveValue("__parked");
});

test("слот: шаг выбирается из подзадач Google, «Уже сделал» закрывает её там", async ({ page }) => {
  const { puts, google } = await open(page, { time: "21:00" });
  const card = page.locator("#slot-card");
  await expect(card.locator("input")).toHaveCount(0);
  const pick = card.locator("select[data-slot-pick]");
  await expect(pick.locator("optgroup")).toHaveCount(2);
  await expect(pick.locator("option", { hasText: "море" })).toHaveCount(0);
  await pick.selectOption({ label: "Выбрать кроватку" });
  await expect(card.locator("h3")).toHaveText("Выбрать кроватку");
  await expect(card).toContainText("Детская комната");
  await expect.poll(() => puts.at(-1)?.sessions?.[`${TODAY} 20:40`]?.taskId).toBe("c5");
  await card.locator('[data-slot-act="done"]').click();
  await expect.poll(() => google.find(x => x.action === "complete")?.id).toBe("c5");
  await expect.poll(() => puts.at(-1)?.sessions?.[`${TODAY} 20:40`]?.status).toBe("done");
});

test("«План → Слоты на неделю»: только выбор подзадачи, без своего текста", async ({ page }) => {
  await open(page, { hash: "plan" });
  const list = page.locator("#slot-plan-list");
  await expect(list.locator("input")).toHaveCount(0);
  await expect(list.locator("select[data-plan-key]").first()).toBeVisible();
  await expect(list.locator("select[data-plan-key]").first().locator("optgroup")).toHaveCount(2);
});

test("демо: вымышленные данные, настоящий вход и сеть не трогаются", async ({ page }) => {
  const net = [], errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.addInitScript(() => {
    localStorage.setItem("habits.cfg", JSON.stringify({ repo: "real/data", token: "REAL" }));
    localStorage.setItem("habits.base", "REAL-BASE");
  });
  await page.route(/api\.github\.com|script\.google\.com/, route => { net.push(route.request().url()); return route.abort(); });
  await page.goto("/?demo#today");
  await expect(page.locator(".demo-bar")).toBeVisible();
  await expect(page.locator("#today-list button[data-hid]").first()).toBeVisible();
  await expect(page.locator("#plan-tasks")).toContainText("Машина к зиме");
  await page.locator('#today-list button[data-hid="read"]').click();
  await expect(page.locator('#today-list button[data-hid="read"]')).toHaveAttribute("aria-pressed", "true");
  await page.waitForTimeout(1600);
  expect(await page.evaluate(() => [localStorage.getItem("habits.cfg"), localStorage.getItem("habits.base"), localStorage.getItem("habits.pending")]))
    .toEqual([JSON.stringify({ repo: "real/data", token: "REAL" }), "REAL-BASE", null]);
  expect(net).toEqual([]);
  expect(errors).toEqual([]);
});

test("напоминания: время сохраняется, на устройстве можно включить", async ({ page }) => {
  const { puts, errors } = await open(page, { hash: "settings" });
  await expect(page.locator("#rm-on")).toBeVisible();
  await expect(page.locator("#rm-evening")).toHaveValue("21:30");
  await page.locator("#rm-evening").selectOption("22:00");
  await page.locator("#rm-slots").uncheck();
  await expect.poll(() => puts.at(-1)?.settings?.reminders).toEqual({ morning: "06:30", evening: "22:00", weekly: "20:00", slots: false, lunch: true, bedtime: true });
  expect((await page.request.get("/sw.js")).ok()).toBe(true);
  expect(errors).toEqual([]);
});

test("сон: после своего подъёма вместо плана — «Ты встал»", async ({ page }) => {
  const data = fixture();
  data.me[TODAY] = { wake: "06:50" };
  await open(page, { hash: "sleep", time: "07:10", data });
  await expect(page.locator("#fc-me-l")).toHaveText("Ты встал");
  await expect(page.locator("#fc-alarm")).toHaveText("6:50");
});

test("вечер: ложное засыпание — «снова уснул» переносит отбой, карточка вдвоём считает окно", async ({ page }) => {
  const data = fixture();
  data.settings.eveningHabit = "duo";
  data.habits.push({ id: "duo", name: "Молитва и чтение с женой", sphere: "жена", target: 5, order: 4, archived: false, created: "2026-09-01" });
  data.kid[TODAY] = { bed: "21:50", nights: ["22:00"] };
  const { puts, errors } = await open(page, { time: "22:05", data });
  await expect(page.locator("#kid-night-l")).toContainText("проснулся ненадолго");
  await expect(page.locator("#kid-sleep-l")).toHaveText("Тёма снова уснул");
  await expect(page.locator("#duo-card")).toContainText("снова уснул");
  await page.locator("#kid-sleep").click();
  await expect.poll(() => puts.at(-1)?.kid?.[TODAY]).toEqual({ bed: "22:05", tries: [{ s: "21:50", w: "22:00" }] });
  await expect(page.locator("#duo-card")).toContainText("Начинайте в 22:25");
  await page.locator('#duo-card [data-duo="done"]').click();
  await expect.poll(() => puts.at(-1)?.log?.[TODAY]?.duo).toBe(true);
  await expect(page.locator("#duo-card")).toContainText("сегодня было");
  expect(errors).toEqual([]);
});

test("молитва: пробуждение ненадолго посреди молитвы видно в «Успел до подъёма»", async ({ page }) => {
  const data = fixture();
  data.kid[day(-1)] = { bed: "23:35", nights: ["06:50", "08:04"] };
  data.prayer[TODAY] = [{ s: "07:58", m: 14 }];
  await open(page, { hash: "prayer", time: "08:30", data });
  await expect(page.locator("#ps-when li").first()).toContainText("Тёма проснулся в 8:04, посреди молитвы");
});

test("календарь подъёмов: свой подъём виден и в день прогноза", async ({ page }) => {
  const data = fixture();
  data.me[TODAY] = { wake: "06:50" };
  await open(page, { hash: "sleep", time: "07:10", data });
  await expect(page.locator('#kcal .kc-c.me[data-tip*="ты встал в 6:50"]')).toHaveCount(1);
});

test("баланс: сфера «по делу» без дел не подсвечивается и не лезет в фокус", async ({ page }) => {
  await open(page);
  await expect(page.locator("#bal-batts")).not.toContainText("здоровье");
  await expect(page.locator("#bal-rec")).not.toContainText("здоровье", { ignoreCase: true });
  await page.goto("/#plan");
  await expect(page.locator("#bl-list .bg-n.od", { hasText: "здоровье" })).toHaveCount(1);
});

test("сферы задач: мама — к родным, а не к работе; kia — к машине", async ({ page }) => {
  const data = fixture();
  data.settings.spheres = ["рост", "жена", "ребёнок", "церковь", "деньги", "здоровье", "дом", "родные", "машина"];
  await open(page, { hash: "plan", data });
  await page.locator("#bal-tags summary").click();
  await expect(page.locator('#bal-tags select[data-tag="m1"]')).toHaveValue("родные");
  await expect(page.locator('#bal-tags select[data-tag="k1"]')).toHaveValue("машина");
  await expect(page.locator('#bal-tags select[data-tag="t1"]')).toHaveValue("рост");
});

test("баланс: рутина видна, но не засчитывается; рабочие дела — в «работу», а не в «рост»", async ({ page }) => {
  const data = fixture();
  data.habits.find(h => h.id === "money").routine = true;
  data.settings.spheres = ["рост", "работа", "жена", "ребёнок", "церковь", "деньги", "здоровье", "дом"];
  await open(page, { hash: "plan", data });
  const row = page.locator("#bl-list .bg-n", { hasText: "деньги" });
  await expect(row).toHaveCount(1);
  await expect(page.locator('#bl-list .bg-c.rut[data-tip*="Записать траты"]')).toHaveCount(3);
  await expect(page.locator('#bl-list .bg-c.on[data-tip*="Записать траты"]')).toHaveCount(0);
  await expect(page.locator("#bl-list .bg-n.od", { hasText: "работа" })).toHaveCount(1);
  await page.locator("#bal-tags summary").click();
  await expect(page.locator('#bal-tags select[data-tag="t1"]')).toHaveValue("рост");
});

test("баланс: клетка недели объясняет, что засчиталось", async ({ page }) => {
  await open(page, { hash: "plan" });
  const cell = page.locator("#bl-list .bg-c.on").first();
  const label = await cell.getAttribute("aria-label");
  await cell.click();
  await expect(page.locator("#bl-detail")).toContainText(label.split(": ")[1].split(", ")[0]);
});

test("лента дня: работа, которая идёт сейчас, — под «сейчас», а не в прошлом", async ({ page }) => {
  await open(page, { time: "10:00" });
  await expect(page.locator("#day-next")).toContainText("Сейчас: Работа до 17:30");
  const items = await page.locator("#day-tl li").allInnerTexts();
  const now = items.findIndex(t => t.includes("сейчас")), work = items.findIndex(t => t.includes("Работа"));
  expect(work).toBe(now + 1);
  await expect(page.locator("#day-tl li.cur")).toContainText("идёт · до 17:30, ещё 7 ч 30 мин");
});

test("стих дня: виден наверху, с делом на сегодня и без кнопки", async ({ page }) => {
  const { errors } = await open(page);
  const card = page.locator("#verse-card");
  await expect(card).toBeVisible();
  await expect(card.locator("cite")).not.toBeEmpty();
  await expect(card).toContainText("Сегодня:");
  await expect(card).not.toContainText("{kid");
  await expect(card.locator("button")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("вид по солнцу: днём — карта, после заката — HUD, ночью — красный свет", async ({ page }) => {
  const look = () => page.evaluate(() => [document.documentElement.dataset.look, document.documentElement.classList.contains("red")]);
  const { errors } = await open(page, { time: "13:00" });
  expect(await look()).toEqual(["chart", false]);
  await expect(page.locator("#hero-status")).toContainText("Курс");
  await expect(page.locator("#sun-t")).toContainText("восход");
  for (const [hm, want] of [["20:00", ["hud", false]], ["23:00", ["hud", true]]]) {
    await page.clock.setFixedTime(`2026-10-02T${hm}:00+03:00`);
    await page.reload();
    await page.locator("#main").waitFor({ state: "visible" });
    expect(await look()).toEqual(want);
  }
  await page.locator('#hero [data-hero="red"]').click();
  expect(await look()).toEqual(["hud", false]);
  expect(errors).toEqual([]);
});

test("воскресенье: «Воскресный день» без фокуса и дел, дела — по кнопке", async ({ page }) => {
  const { errors } = await open(page);
  await page.clock.setFixedTime("2026-10-04T12:00:00+03:00");
  await page.reload();
  await page.locator("#main").waitFor({ state: "visible" });
  await expect(page.locator("#phase")).toHaveText("Воскресный день");
  await expect(page.locator("#focus-card")).toBeHidden();
  await expect(page.locator("#verse-card cite")).toHaveText("Псалом 117:24");
  await page.locator('#hero [data-hero="show"]').click();
  await expect(page.locator("#focus-card")).toBeVisible();
  expect(errors).toEqual([]);
});

test("фокус не предлагает задачи, которые уже есть в «Задачах» на сегодня", async ({ page }) => {
  await open(page);
  const more = page.locator("#bal-rec [data-bmore]");
  if (await more.count()) await more.click();
  const seen = new Set();
  for (const alt of await page.locator("#bal-rec [data-balt]").all())
    for (let i = 0; i < 4; i++) { (await page.locator("#bal-rec button.pi").allInnerTexts()).forEach(t => seen.add(t)); await alt.click(); }
  (await page.locator("#bal-rec button.pi").allInnerTexts()).forEach(t => seen.add(t));
  const all = [...seen].join("\n");
  for (const t of ["Подготовить машину к зиме", "Записаться на шиномонтаж", "Покрасить стену"]) expect(all).not.toContain(t);
});

test("книга: в обед — карточка с прогнозом вечера, «Прочитал» отмечает привычку", async ({ page }) => {
  const data = fixture();
  data.settings.lunch = "13:00";
  data.kid[day(-3)].bed = "23:30"; data.kid[day(-1)].bed = "23:10"; data.kid[day(-2)].bed = "23:20";
  const { puts, errors } = await open(page, { time: "13:05", data });
  await expect(page.locator("#book-card")).toContainText("Обед — время книги, 15 мин");
  await expect(page.locator("#book-card")).toContainText("Вечером окна, скорее всего, не будет");
  await page.locator("#book-card [data-book]").click();
  await expect.poll(() => puts.at(-1)?.log?.[TODAY]?.read).toBe(true);
  await expect(page.locator("#book-card")).toBeHidden();
  expect(errors).toEqual([]);
});

test("книга вечером: успеваешь — «читать сейчас», после крайнего срока — «завтра в обед»", async ({ page }) => {
  const data = fixture();
  data.kid[TODAY] = { bed: "21:40" };
  await open(page, { time: "22:00", data });
  await expect(page.locator("#book-card")).toContainText("Можно читать сейчас — 15 мин, до 22:15");
  await page.clock.setFixedTime(`${TODAY}T23:10:00+03:00`);
  await page.reload();
  await page.locator("#main").waitFor({ state: "visible" });
  await expect(page.locator("#book-card")).toContainText("Книга — завтра в обед");
  // после отбоя книга молчит — остаётся только «Отбой был»
  await page.clock.setFixedTime(`${TODAY}T23:35:00+03:00`);
  await page.reload();
  await page.locator("#main").waitFor({ state: "visible" });
  await expect(page.locator("#book-card")).toBeHidden();
  await expect(page.locator("#ritual-card")).toContainText("Отбой был в 23:30");
});

test("книга вечером: если вдвоём ещё впереди и до отбоя не влезет — честно говорит об этом", async ({ page }) => {
  const data = fixture();
  data.settings.eveningHabit = "duo";
  data.habits.push({ id: "duo", name: "Молитва и чтение с женой", sphere: "жена", target: 5, order: 4, archived: false, created: "2026-09-01" });
  data.kid[TODAY] = { bed: "22:40" };
  await open(page, { time: "22:45", data });
  await expect(page.locator("#book-card")).toContainText("Сегодня книга не влезет");
  await expect(page.locator("#book-card")).toContainText("вдвоём — до ≈ 23:30");
});

test("книга вечером: пока вдвоём не начали, окно сдвигается вместе со временем", async ({ page }) => {
  const data = fixture();
  data.settings.eveningHabit = "duo";
  data.habits.push({ id: "duo", name: "Молитва и чтение с женой", sphere: "жена", target: 5, order: 4, archived: false, created: "2026-09-01" });
  data.kid[TODAY] = { bed: "21:30" };
  await open(page, { time: "22:00", data });
  await expect(page.locator("#book-card")).toContainText("Окно для книги ≈ 22:30–22:45");
  await page.clock.setFixedTime(`${TODAY}T22:40:00+03:00`);
  await page.reload();
  await page.locator("#main").waitFor({ state: "visible" });
  await expect(page.locator("#book-card")).toContainText("Сегодня книга не влезет");
});

test("отбой: после него — короткое закрытие дня, хвосты уходят на завтра", async ({ page }) => {
  const data = fixture();
  data.focus[TODAY] = [{ t: "Позвонить в банк", src: "" }, { t: "Выбрать подарок", src: "", done: true }];
  const { puts, google, errors } = await open(page, { time: "23:40", data });
  await expect(page.locator("#ritual-card")).toContainText("Отбой был в 23:30");
  await page.locator('#ritual-card [data-open-wizard="short"]').click();
  await expect(page.locator("#sheet-title")).toHaveText("Хвосты — на завтра");
  const tails = page.locator("#sheet-body [data-tail]");
  await expect(tails).toHaveText([/Позвонить в банк/, /Подготовить машину к зиме/, /Покрасить стену/]);
  await tails.filter({ hasText: "Покрасить стену" }).click();
  await expect(tails.filter({ hasText: "Покрасить стену" })).toContainText("останется как есть");
  await page.locator("#sheet-next").click();
  await expect.poll(() => puts.at(-1)?.rituals?.short?.[TODAY]).toBe("23:40");
  expect(puts.at(-1).rituals.evening[TODAY]).toBe("23:40");
  expect(puts.at(-1).focus[day(1)].map(x => x.t)).toEqual(["Позвонить в банк"]);
  await expect.poll(() => google.map(x => `${x.action} ${x.id} ${x.due}`)).toEqual([`due p1 ${day(1)}`]);
  await expect(page.locator("#ritual-card")).toBeHidden();
  expect(errors).toEqual([]);
});

test("утро после короткого вечера: отдельного шага нет — главное выбирается в карточке", async ({ page }) => {
  const data = fixture();
  data.rituals = { evening: { [day(-1)]: "00:20" }, short: { [day(-1)]: "00:20" } };
  await open(page, { time: "09:30", data });
  await expect(page.locator("#ritual-card")).toBeHidden();
  await expect(page.locator("#focus-list")).toContainText("Выбрать сейчас");
});

test("показатель «Отбой»: сколько вечеров закрыто вовремя и сколько сна", async ({ page }) => {
  const data = fixture();
  data.rituals = { evening: { [day(-1)]: "23:20", [day(-2)]: "01:00" } };
  data.me = { [TODAY]: { wake: "07:00" }, [day(-1)]: { wake: "07:00" } };
  await open(page, { time: "10:00", data });
  const m = page.locator(".metric", { hasText: "Отбой" });
  await expect(m).toContainText("1из 7");
  await expect(m).toContainText("вечер вовремя · сон ≈ 6 ч");
});
