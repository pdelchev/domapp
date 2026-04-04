'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '../../../context/LanguageContext';
import { t } from '../../../lib/i18n';
import NavBar from '../../../components/NavBar';
import { PageShell, PageContent, PageHeader, Card, Badge } from '../../../components/ui';

// 15-day rotating meal plan — targets: lower glucose, protect liver, reduce uric acid
// Mediterranean-style, low glycemic, anti-inflammatory
const MEALS: { b: string; l: string; d: string; s: string }[] = [
  // Day 1
  { b: 'Oatmeal with walnuts, blueberries & cinnamon (no sugar)', l: 'Grilled chicken salad with spinach, chickpeas, olive oil & lemon', d: 'Baked salmon with roasted broccoli & quinoa', s: 'Handful of almonds + green tea' },
  // Day 2
  { b: 'Greek yogurt (unsweetened) with chia seeds & strawberries', l: 'Lentil soup with whole grain bread & side salad', d: 'Turkey meatballs with zucchini noodles & tomato sauce', s: 'Cucumber slices with hummus' },
  // Day 3
  { b: 'Scrambled eggs (2) with spinach, tomato & whole grain toast', l: 'Grilled sea bass with steamed green beans & brown rice', d: 'Chicken stir-fry with bell peppers, mushrooms & ginger', s: 'Apple slices with almond butter' },
  // Day 4
  { b: 'Buckwheat porridge with flaxseed & raspberries', l: 'Chickpea & vegetable curry with cauliflower rice', d: 'Baked cod with roasted sweet potato & asparagus', s: 'Walnuts + herbal tea (milk thistle)' },
  // Day 5
  { b: 'Avocado toast on rye bread with poached egg', l: 'Quinoa bowl with grilled chicken, cucumber, tomato & tahini', d: 'Stuffed bell peppers with lean ground turkey & brown rice', s: 'Celery sticks with cottage cheese' },
  // Day 6
  { b: 'Smoothie: spinach, avocado, protein powder, almond milk', l: 'White bean & kale soup with garlic croutons', d: 'Grilled chicken breast with roasted Brussels sprouts & lentils', s: 'Cherry tomatoes with mozzarella' },
  // Day 7
  { b: 'Whole grain pancakes (no sugar) with berries & Greek yogurt', l: 'Tuna salad (fresh, not canned) with mixed greens & olive oil', d: 'Lamb chops (small portion) with baked eggplant & bulgur', s: 'Handful of pumpkin seeds + green tea' },
  // Day 8
  { b: 'Overnight oats with walnuts, cinnamon & grated apple', l: 'Grilled mackerel with roasted beets & arugula salad', d: 'Chicken & vegetable stew with sweet potato', s: 'Carrot sticks with guacamole' },
  // Day 9
  { b: 'Cottage cheese with flaxseed, walnuts & blueberries', l: 'Brown rice bowl with tofu, edamame, seaweed & ginger dressing', d: 'Baked trout with steamed broccoli & mashed cauliflower', s: 'Boiled egg + herbal tea' },
  // Day 10
  { b: 'Rye bread with smoked salmon, cream cheese & dill', l: 'Minestrone soup with whole grain bread', d: 'Grilled chicken thighs with roasted zucchini & quinoa tabbouleh', s: 'Mixed nuts (no peanuts) + dark chocolate (85%, 2 squares)' },
  // Day 11
  { b: 'Chia pudding with coconut milk & mango', l: 'Stuffed zucchini boats with lean beef, tomato & feta', d: 'Baked sea bream with sauteed spinach & wild rice', s: 'Greek yogurt with cinnamon' },
  // Day 12
  { b: 'Omelette (2 eggs) with mushrooms, peppers & herbs', l: 'Grilled chicken Caesar salad (olive oil dressing, no croutons)', d: 'Slow-cooked white bean stew with kale & garlic', s: 'Apple + handful of cashews' },
  // Day 13
  { b: 'Muesli (no sugar) with almond milk, banana & hemp seeds', l: 'Sardine salad with cherry tomatoes, olives & whole grain bread', d: 'Turkey breast with roasted butternut squash & green salad', s: 'Cucumber & carrot sticks with tzatziki' },
  // Day 14
  { b: 'Buckwheat crepes with ricotta & berries', l: 'Lentil & roasted vegetable salad with feta & walnuts', d: 'Baked chicken drumsticks with roasted cauliflower & tahini', s: 'Pear + green tea' },
  // Day 15
  { b: 'Smoothie bowl: berries, banana, protein powder, topped with granola & coconut', l: 'Grilled salmon fillet with avocado, quinoa & mixed greens', d: 'Vegetable moussaka (eggplant, zucchini, tomato, light bechamel)', s: 'Walnuts + dark chocolate (85%, 2 squares)' },
];

const MEALS_BG: { b: string; l: string; d: string; s: string }[] = [
  { b: 'Овесена каша с орехи, боровинки и канела (без захар)', l: 'Салата с пилешко, спанак, нахут, зехтин и лимон', d: 'Печена сьомга с броколи и киноа', s: 'Шепа бадеми + зелен чай' },
  { b: 'Гръцко кисело мляко (без захар) с чиа и ягоди', l: 'Супа от леща с пълнозърнест хляб и салата', d: 'Кюфтета от пуйка с тиквички на спирали и доматен сос', s: 'Краставици с хумус' },
  { b: 'Бъркани яйца (2) със спанак, домат и пълнозърнест тост', l: 'Лаврак на скара със задушени зелени фасулки и кафяв ориз', d: 'Пилешко със зеленчуци, чушки, гъби и джинджифил', s: 'Ябълкови резенки с бадемово масло' },
  { b: 'Елдова каша с ленено семе и малини', l: 'Нахутено къри със зеленчуци и ориз от карфиол', d: 'Печена треска със сладък картоф и аспержи', s: 'Орехи + билков чай (бял трън)' },
  { b: 'Авокадо тост на ръжен хляб с поширано яйце', l: 'Купа с киноа, пилешко, краставица, домат и тахан', d: 'Пълнени чушки с пуешка кайма и кафяв ориз', s: 'Целина с извара' },
  { b: 'Смути: спанак, авокадо, протеин, бадемово мляко', l: 'Супа от бял боб и кейл с крутони', d: 'Пилешки гърди на скара с брюкселско зеле и леща', s: 'Чери домати с моцарела' },
  { b: 'Пълнозърнести палачинки с горски плодове и кисело мляко', l: 'Салата от прясна риба тон с микс зеленина и зехтин', d: 'Агнешки котлети (малка порция) с печен патладжан и булгур', s: 'Шепа тиквени семки + зелен чай' },
  { b: 'Овесена каша (през нощта) с орехи, канела и ябълка', l: 'Скумрия на скара с печено цвекло и рукола', d: 'Пилешка яхния със зеленчуци и сладък картоф', s: 'Моркови с гуакамоле' },
  { b: 'Извара с ленено семе, орехи и боровинки', l: 'Купа с кафяв ориз, тофу, едамаме и джинджифил', d: 'Печена пъстърва с броколи и пюре от карфиол', s: 'Варено яйце + билков чай' },
  { b: 'Ръжен хляб с пушена сьомга, крема сирене и копър', l: 'Минестроне с пълнозърнест хляб', d: 'Пилешки бутчета на скара с тиквички и табуле от киноа', s: 'Микс ядки + тъмен шоколад (85%, 2 парченца)' },
  { b: 'Чиа пудинг с кокосово мляко и манго', l: 'Пълнени тиквички с кайма, домат и фета', d: 'Печена ципура със задушен спанак и див ориз', s: 'Кисело мляко с канела' },
  { b: 'Омлет (2 яйца) с гъби, чушки и подправки', l: 'Пилешка Цезар салата (зехтин дресинг, без крутони)', d: 'Задушен бял боб с кейл и чесън', s: 'Ябълка + шепа кашу' },
  { b: 'Мюсли (без захар) с бадемово мляко, банан и конопени семки', l: 'Салата от сардини с чери домати, маслини и хляб', d: 'Пуешки гърди с печена тиква и зелена салата', s: 'Краставица и моркови с цацики' },
  { b: 'Елдови палачинки с рикота и горски плодове', l: 'Салата от леща, печени зеленчуци, фета и орехи', d: 'Печени пилешки бутчета с карфиол и тахан', s: 'Круша + зелен чай' },
  { b: 'Смути купа: горски плодове, банан, протеин, гранола и кокос', l: 'Филе от сьомга на скара с авокадо, киноа и зеленина', d: 'Зеленчукова мусака (патладжан, тиквичка, домат, лек бешамел)', s: 'Орехи + тъмен шоколад (85%, 2 парченца)' },
];

const PRINCIPLES = {
  en: [
    '🩸 Low glycemic — no white bread, pasta, sugar, juice, or sweets',
    '🫁 Liver-friendly — zero alcohol, daily coffee (1-2 cups, no sugar), milk thistle tea',
    '🫘 Low purine — avoid organ meats, sardines (limit), beer; drink 2.5-3L water daily',
    '🥗 Mediterranean base — olive oil, fish 3x/week, vegetables at every meal, whole grains',
    '💊 Supplements: Vitamin D 2000IU, Omega-3 fish oil, Milk thistle, Zinc, Cinnamon extract',
    '⏰ Eating window: 8-10 hours (e.g. 10:00-20:00), no late-night eating',
    '❤️ DASH principles — reduce sodium (<2300mg/day), increase potassium (bananas, spinach, avocado), limit processed food for blood pressure control',
  ],
  bg: [
    '🩸 Нисък гликемичен индекс — без бял хляб, паста, захар, сок или сладки',
    '🫁 Щадящо за черния дроб — нула алкохол, дневно кафе (1-2 чаши, без захар), чай от бял трън',
    '🫘 Ниско съдържание на пурини — избягвайте карантии, сардини (ограничете), бира; пийте 2.5-3L вода дневно',
    '🥗 Средиземноморска база — зехтин, риба 3x/седмично, зеленчуци на всяко хранене, пълнозърнести',
    '💊 Добавки: Витамин D 2000IU, Омега-3, Бял трън, Цинк, Екстракт от канела',
    '⏰ Прозорец за хранене: 8-10 часа (напр. 10:00-20:00), без ядене късно вечер',
    '❤️ DASH принципи — намалете натрия (<2300mg/ден), увеличете калия (банани, спанак, авокадо), ограничете преработени храни за контрол на кръвното налягане',
  ],
};

export default function MealPlanPage() {
  const router = useRouter();
  const { locale } = useLanguage();
  const [selectedDay, setSelectedDay] = useState(0);

  const meals = locale === 'bg' ? MEALS_BG : MEALS;
  const day = meals[selectedDay];

  return (
    <PageShell>
      <NavBar />
      <PageContent size="lg">
        <PageHeader
          title={t('lifestyle.meal_plan', locale)}
          backLabel={t('common.back', locale)}
          onBack={() => router.push('/health/lifestyle')}
        />
        <p className="text-sm text-gray-500 -mt-4 mb-4">
          {locale === 'en'
            ? '15-day rotating menu targeting: glucose control, liver recovery, uric acid reduction'
            : '15-дневно ротиращо меню за: контрол на глюкозата, възстановяване на черния дроб, намаляване на пикочната киселина'}
        </p>

        {/* Key principles */}
        <Card className="mb-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">
            {locale === 'en' ? 'Key Dietary Principles' : 'Основни хранителни принципи'}
          </h3>
          <ul className="space-y-1.5">
            {PRINCIPLES[locale].map((p, i) => (
              <li key={i} className="text-sm text-gray-600">{p}</li>
            ))}
          </ul>
        </Card>

        {/* Day selector */}
        <div className="flex flex-wrap gap-1.5 mb-5">
          {MEALS.map((_, i) => (
            <button
              key={i}
              onClick={() => setSelectedDay(i)}
              className={`w-10 h-10 rounded-lg text-sm font-medium transition-colors ${
                selectedDay === i
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {i + 1}
            </button>
          ))}
        </div>

        {/* Selected day meals */}
        <h2 className="text-base font-semibold text-gray-900 mb-3">
          {t('lifestyle.day', locale)} {selectedDay + 1}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          {[
            { key: 'breakfast', icon: '🌅', text: day.b },
            { key: 'lunch', icon: '☀️', text: day.l },
            { key: 'dinner', icon: '🌙', text: day.d },
            { key: 'snacks', icon: '🥜', text: day.s },
          ].map((meal) => (
            <Card key={meal.key}>
              <div className="flex items-start gap-2.5">
                <span className="text-xl">{meal.icon}</span>
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                    {t(`lifestyle.${meal.key}`, locale)}
                  </h4>
                  <p className="text-sm text-gray-800 leading-relaxed">{meal.text}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* All 15 days overview */}
        <h2 className="text-base font-semibold text-gray-900 mb-3">
          {locale === 'en' ? 'Full 15-Day Overview' : 'Преглед на 15-дневния план'}
        </h2>
        <Card padding={false}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead>
                <tr className="border-b border-gray-200 text-left">
                  <th className="px-4 py-2.5 text-xs font-medium text-gray-500 uppercase w-16">{t('lifestyle.day', locale)}</th>
                  <th className="px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">{t('lifestyle.breakfast', locale)}</th>
                  <th className="px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">{t('lifestyle.lunch', locale)}</th>
                  <th className="px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">{t('lifestyle.dinner', locale)}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {meals.map((m, i) => (
                  <tr
                    key={i}
                    className={`hover:bg-gray-50 cursor-pointer ${selectedDay === i ? 'bg-indigo-50' : ''}`}
                    onClick={() => setSelectedDay(i)}
                  >
                    <td className="px-4 py-2.5">
                      <Badge color={selectedDay === i ? 'indigo' : 'gray'}>{i + 1}</Badge>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-600 max-w-[200px] truncate">{m.b}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-600 max-w-[200px] truncate">{m.l}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-600 max-w-[200px] truncate">{m.d}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </PageContent>
    </PageShell>
  );
}
