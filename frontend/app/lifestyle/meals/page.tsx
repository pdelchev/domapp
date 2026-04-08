'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '../../context/LanguageContext';
import { t } from '../../lib/i18n';
import NavBar from '../../components/NavBar';
import { PageShell, PageContent, PageHeader, Card, Badge } from '../../components/ui';

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

// Ingredients per day — grouped by meal
interface DayIngredients { b: string[]; l: string[]; d: string[]; s: string[]; }

const INGREDIENTS: DayIngredients[] = [
  // Day 1
  { b: ['Rolled oats 50g', 'Walnuts 20g', 'Blueberries 80g', 'Cinnamon'], l: ['Chicken breast 150g', 'Spinach 100g', 'Chickpeas (canned) 100g', 'Olive oil', 'Lemon 1'], d: ['Salmon fillet 180g', 'Broccoli 200g', 'Quinoa 80g'], s: ['Almonds 30g', 'Green tea'] },
  // Day 2
  { b: ['Greek yogurt (unsweetened) 200g', 'Chia seeds 15g', 'Strawberries 100g'], l: ['Red lentils 100g', 'Whole grain bread 2 slices', 'Carrot 1', 'Celery 1 stalk', 'Onion 1'], d: ['Ground turkey 200g', 'Zucchini 2', 'Canned tomatoes 200g', 'Garlic'], s: ['Cucumber 1', 'Hummus 50g'] },
  // Day 3
  { b: ['Eggs 2', 'Spinach 50g', 'Tomato 1', 'Whole grain bread 1 slice'], l: ['Sea bass fillet 180g', 'Green beans 200g', 'Brown rice 80g', 'Lemon 1'], d: ['Chicken breast 150g', 'Bell peppers 2', 'Mushrooms 150g', 'Ginger root', 'Soy sauce'], s: ['Apple 1', 'Almond butter 1 tbsp'] },
  // Day 4
  { b: ['Buckwheat groats 60g', 'Flaxseed 15g', 'Raspberries 80g'], l: ['Chickpeas (canned) 200g', 'Cauliflower 1 head', 'Curry paste', 'Coconut milk 100ml', 'Mixed vegetables 200g'], d: ['Cod fillet 180g', 'Sweet potato 1', 'Asparagus 200g'], s: ['Walnuts 30g', 'Milk thistle tea'] },
  // Day 5
  { b: ['Avocado 1', 'Rye bread 1 slice', 'Egg 1'], l: ['Quinoa 80g', 'Chicken breast 150g', 'Cucumber 1', 'Tomato 1', 'Tahini 1 tbsp'], d: ['Bell peppers 4', 'Ground turkey 200g', 'Brown rice 80g', 'Tomato sauce 100ml'], s: ['Celery 2 stalks', 'Cottage cheese 100g'] },
  // Day 6
  { b: ['Spinach 80g', 'Avocado ½', 'Protein powder 1 scoop', 'Almond milk 250ml'], l: ['White beans (canned) 200g', 'Kale 150g', 'Garlic 2 cloves', 'Whole grain bread 1 slice'], d: ['Chicken breast 180g', 'Brussels sprouts 200g', 'Red lentils 80g'], s: ['Cherry tomatoes 100g', 'Mozzarella 50g'] },
  // Day 7
  { b: ['Whole grain flour 80g', 'Egg 1', 'Mixed berries 100g', 'Greek yogurt 50g'], l: ['Fresh tuna steak 150g', 'Mixed greens 100g', 'Olive oil', 'Lemon 1'], d: ['Lamb chops 150g', 'Eggplant 1', 'Bulgur 80g'], s: ['Pumpkin seeds 30g', 'Green tea'] },
  // Day 8
  { b: ['Rolled oats 50g', 'Walnuts 20g', 'Cinnamon', 'Apple 1'], l: ['Mackerel fillet 180g', 'Beetroot 2', 'Arugula 80g', 'Olive oil'], d: ['Chicken thighs 200g', 'Sweet potato 1', 'Carrots 2', 'Onion 1', 'Celery 1 stalk'], s: ['Carrots 2', 'Avocado ½', 'Lime 1'] },
  // Day 9
  { b: ['Cottage cheese 150g', 'Flaxseed 15g', 'Walnuts 20g', 'Blueberries 80g'], l: ['Brown rice 80g', 'Tofu 200g', 'Edamame 100g', 'Ginger root', 'Soy sauce'], d: ['Trout fillet 180g', 'Broccoli 200g', 'Cauliflower 1 head'], s: ['Egg 1', 'Herbal tea'] },
  // Day 10
  { b: ['Rye bread 2 slices', 'Smoked salmon 80g', 'Cream cheese 30g', 'Dill'], l: ['Mixed vegetables 300g', 'Canned tomatoes 200g', 'White beans 100g', 'Whole grain bread 1 slice'], d: ['Chicken thighs 200g', 'Zucchini 2', 'Quinoa 80g', 'Parsley', 'Lemon 1', 'Cucumber 1'], s: ['Mixed nuts 30g', 'Dark chocolate 85% (20g)'] },
  // Day 11
  { b: ['Chia seeds 30g', 'Coconut milk 200ml', 'Mango 1'], l: ['Zucchini 3', 'Lean ground beef 150g', 'Tomato 2', 'Feta cheese 50g'], d: ['Sea bream fillet 180g', 'Spinach 200g', 'Wild rice 80g'], s: ['Greek yogurt 150g', 'Cinnamon'] },
  // Day 12
  { b: ['Eggs 2', 'Mushrooms 100g', 'Bell pepper 1', 'Herbs (parsley, dill)'], l: ['Chicken breast 150g', 'Romaine lettuce 1 head', 'Parmesan 20g', 'Olive oil', 'Lemon 1'], d: ['White beans (canned) 300g', 'Kale 150g', 'Garlic 3 cloves', 'Olive oil'], s: ['Apple 1', 'Cashews 30g'] },
  // Day 13
  { b: ['Muesli (no sugar) 60g', 'Almond milk 200ml', 'Banana 1', 'Hemp seeds 15g'], l: ['Sardines (canned) 120g', 'Cherry tomatoes 150g', 'Olives 30g', 'Whole grain bread 1 slice'], d: ['Turkey breast 180g', 'Butternut squash 300g', 'Mixed greens 80g'], s: ['Cucumber 1', 'Carrots 2', 'Tzatziki 50g'] },
  // Day 14
  { b: ['Buckwheat flour 80g', 'Ricotta 80g', 'Mixed berries 100g', 'Egg 1'], l: ['Green lentils 100g', 'Roasted vegetables 200g', 'Feta 50g', 'Walnuts 20g'], d: ['Chicken drumsticks 250g', 'Cauliflower 1 head', 'Tahini 2 tbsp', 'Lemon 1'], s: ['Pear 1', 'Green tea'] },
  // Day 15
  { b: ['Mixed berries 100g', 'Banana 1', 'Protein powder 1 scoop', 'Granola 30g', 'Coconut flakes 10g'], l: ['Salmon fillet 180g', 'Avocado 1', 'Quinoa 80g', 'Mixed greens 80g'], d: ['Eggplant 1', 'Zucchini 2', 'Canned tomatoes 300g', 'Milk 100ml', 'Flour 1 tbsp'], s: ['Walnuts 30g', 'Dark chocolate 85% (20g)'] },
];

const INGREDIENTS_BG: DayIngredients[] = [
  { b: ['Овесени ядки 50г', 'Орехи 20г', 'Боровинки 80г', 'Канела'], l: ['Пилешко филе 150г', 'Спанак 100г', 'Нахут (консерва) 100г', 'Зехтин', 'Лимон 1'], d: ['Филе от сьомга 180г', 'Броколи 200г', 'Киноа 80г'], s: ['Бадеми 30г', 'Зелен чай'] },
  { b: ['Гръцко кисело мляко 200г', 'Чиа семена 15г', 'Ягоди 100г'], l: ['Червена леща 100г', 'Пълнозърнест хляб 2 филии', 'Морков 1', 'Целина 1 стрък', 'Лук 1'], d: ['Пуешка кайма 200г', 'Тиквички 2', 'Домати (консерва) 200г', 'Чесън'], s: ['Краставица 1', 'Хумус 50г'] },
  { b: ['Яйца 2', 'Спанак 50г', 'Домат 1', 'Пълнозърнест хляб 1 филия'], l: ['Филе от лаврак 180г', 'Зелен фасул 200г', 'Кафяв ориз 80г', 'Лимон 1'], d: ['Пилешко филе 150г', 'Чушки 2', 'Гъби 150г', 'Джинджифил', 'Соев сос'], s: ['Ябълка 1', 'Бадемово масло 1 с.л.'] },
  { b: ['Елда 60г', 'Ленено семе 15г', 'Малини 80г'], l: ['Нахут (консерва) 200г', 'Карфиол 1', 'Къри паста', 'Кокосово мляко 100мл', 'Микс зеленчуци 200г'], d: ['Филе от треска 180г', 'Сладък картоф 1', 'Аспержи 200г'], s: ['Орехи 30г', 'Чай от бял трън'] },
  { b: ['Авокадо 1', 'Ръжен хляб 1 филия', 'Яйце 1'], l: ['Киноа 80г', 'Пилешко филе 150г', 'Краставица 1', 'Домат 1', 'Тахан 1 с.л.'], d: ['Чушки 4', 'Пуешка кайма 200г', 'Кафяв ориз 80г', 'Доматен сос 100мл'], s: ['Целина 2 стръка', 'Извара 100г'] },
  { b: ['Спанак 80г', 'Авокадо ½', 'Протеин 1 доза', 'Бадемово мляко 250мл'], l: ['Бял боб (консерва) 200г', 'Кейл 150г', 'Чесън 2 скилидки', 'Пълнозърнест хляб 1 филия'], d: ['Пилешко филе 180г', 'Брюкселско зеле 200г', 'Червена леща 80г'], s: ['Чери домати 100г', 'Моцарела 50г'] },
  { b: ['Пълнозърнесто брашно 80г', 'Яйце 1', 'Горски плодове 100г', 'Кисело мляко 50г'], l: ['Прясна риба тон 150г', 'Микс зеленина 100г', 'Зехтин', 'Лимон 1'], d: ['Агнешки котлети 150г', 'Патладжан 1', 'Булгур 80г'], s: ['Тиквени семки 30г', 'Зелен чай'] },
  { b: ['Овесени ядки 50г', 'Орехи 20г', 'Канела', 'Ябълка 1'], l: ['Филе от скумрия 180г', 'Цвекло 2', 'Рукола 80г', 'Зехтин'], d: ['Пилешки бутчета 200г', 'Сладък картоф 1', 'Моркови 2', 'Лук 1', 'Целина 1 стрък'], s: ['Моркови 2', 'Авокадо ½', 'Лайм 1'] },
  { b: ['Извара 150г', 'Ленено семе 15г', 'Орехи 20г', 'Боровинки 80г'], l: ['Кафяв ориз 80г', 'Тофу 200г', 'Едамаме 100г', 'Джинджифил', 'Соев сос'], d: ['Филе от пъстърва 180г', 'Броколи 200г', 'Карфиол 1'], s: ['Яйце 1', 'Билков чай'] },
  { b: ['Ръжен хляб 2 филии', 'Пушена сьомга 80г', 'Крема сирене 30г', 'Копър'], l: ['Микс зеленчуци 300г', 'Домати (консерва) 200г', 'Бял боб 100г', 'Пълнозърнест хляб 1 филия'], d: ['Пилешки бутчета 200г', 'Тиквички 2', 'Киноа 80г', 'Магданоз', 'Лимон 1', 'Краставица 1'], s: ['Микс ядки 30г', 'Тъмен шоколад 85% (20г)'] },
  { b: ['Чиа семена 30г', 'Кокосово мляко 200мл', 'Манго 1'], l: ['Тиквички 3', 'Телешка кайма 150г', 'Домат 2', 'Фета 50г'], d: ['Филе от ципура 180г', 'Спанак 200г', 'Див ориз 80г'], s: ['Кисело мляко 150г', 'Канела'] },
  { b: ['Яйца 2', 'Гъби 100г', 'Чушка 1', 'Подправки (магданоз, копър)'], l: ['Пилешко филе 150г', 'Маруля 1', 'Пармезан 20г', 'Зехтин', 'Лимон 1'], d: ['Бял боб (консерва) 300г', 'Кейл 150г', 'Чесън 3 скилидки', 'Зехтин'], s: ['Ябълка 1', 'Кашу 30г'] },
  { b: ['Мюсли (без захар) 60г', 'Бадемово мляко 200мл', 'Банан 1', 'Конопени семки 15г'], l: ['Сардини (консерва) 120г', 'Чери домати 150г', 'Маслини 30г', 'Пълнозърнест хляб 1 филия'], d: ['Пуешко филе 180г', 'Тиква 300г', 'Микс зеленина 80г'], s: ['Краставица 1', 'Моркови 2', 'Цацики 50г'] },
  { b: ['Елдово брашно 80г', 'Рикота 80г', 'Горски плодове 100г', 'Яйце 1'], l: ['Зелена леща 100г', 'Печени зеленчуци 200г', 'Фета 50г', 'Орехи 20г'], d: ['Пилешки бутчета 250г', 'Карфиол 1', 'Тахан 2 с.л.', 'Лимон 1'], s: ['Круша 1', 'Зелен чай'] },
  { b: ['Горски плодове 100г', 'Банан 1', 'Протеин 1 доза', 'Гранола 30г', 'Кокосови стърготини 10г'], l: ['Филе от сьомга 180г', 'Авокадо 1', 'Киноа 80г', 'Микс зеленина 80г'], d: ['Патладжан 1', 'Тиквички 2', 'Домати (консерва) 300г', 'Мляко 100мл', 'Брашно 1 с.л.'], s: ['Орехи 30г', 'Тъмен шоколад 85% (20г)'] },
];

const PRINCIPLES = {
  en: [
    '🩸 Low glycemic — no white bread, pasta, sugar, juice, or sweets',
    '🫁 Liver-friendly — zero alcohol, daily coffee (1-2 cups, no sugar), milk thistle tea',
    '🫘 Low purine — avoid organ meats, sardines (limit), beer; drink 2.5-3L water daily',
    '🥗 Mediterranean base — olive oil, fish 3x/week, vegetables at every meal, whole grains',
    '💊 Supplements: Vitamin D 2000IU, Omega-3 fish oil, Milk thistle, Zinc, Cinnamon extract',
    '⏰ Eating window: 8-10 hours (e.g. 10:00-20:00), no late-night eating',
  ],
  bg: [
    '🩸 Нисък гликемичен индекс — без бял хляб, паста, захар, сок или сладки',
    '🫁 Щадящо за черния дроб — нула алкохол, дневно кафе (1-2 чаши, без захар), чай от бял трън',
    '🫘 Ниско съдържание на пурини — избягвайте карантии, сардини (ограничете), бира; пийте 2.5-3L вода дневно',
    '🥗 Средиземноморска база — зехтин, риба 3x/седмично, зеленчуци на всяко хранене, пълнозърнести',
    '💊 Добавки: Витамин D 2000IU, Омега-3, Бял трън, Цинк, Екстракт от канела',
    '⏰ Прозорец за хранене: 8-10 часа (напр. 10:00-20:00), без ядене късно вечер',
  ],
};

export default function MealPlanPage() {
  const router = useRouter();
  const { locale } = useLanguage();
  const [selectedDay, setSelectedDay] = useState(0);
  const [showIngredients, setShowIngredients] = useState(false);

  const meals = locale === 'bg' ? MEALS_BG : MEALS;
  const day = meals[selectedDay];
  const ingredients = locale === 'bg' ? INGREDIENTS_BG : INGREDIENTS;
  const dayIngr = ingredients[selectedDay];

  return (
    <PageShell>
      <NavBar />
      <PageContent size="lg">
        <PageHeader
          title={t('lifestyle.meal_plan', locale)}
          backLabel={t('common.back', locale)}
          onBack={() => router.push('/lifestyle')}
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

        {/* Shopping List Toggle */}
        <button
          onClick={() => setShowIngredients(!showIngredients)}
          className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-colors mb-4 ${
            showIngredients
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
          }`}
        >
          <span className="flex items-center gap-2 text-sm font-medium">
            <span className="text-lg">🛒</span>
            {locale === 'bg'
              ? `Списък за пазаруване — Ден ${selectedDay + 1}`
              : `Shopping List — Day ${selectedDay + 1}`}
          </span>
          <svg className={`w-4 h-4 transition-transform ${showIngredients ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showIngredients && (
          <Card className="mb-6">
            <div className="space-y-4">
              {[
                { key: 'breakfast', icon: '🌅', items: dayIngr.b },
                { key: 'lunch', icon: '☀️', items: dayIngr.l },
                { key: 'dinner', icon: '🌙', items: dayIngr.d },
                { key: 'snacks', icon: '🥜', items: dayIngr.s },
              ].map((section) => (
                <div key={section.key}>
                  <h4 className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                    <span>{section.icon}</span>
                    {t(`lifestyle.${section.key}`, locale)}
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {section.items.map((item, j) => (
                      <span key={j} className="inline-flex items-center px-2.5 py-1 text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded-lg">
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              ))}

              {/* Combined list */}
              <div className="border-t border-gray-100 pt-3">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  🧾 {locale === 'bg' ? 'Всичко за деня' : 'Full day list'}
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                  {[...new Set([...dayIngr.b, ...dayIngr.l, ...dayIngr.d, ...dayIngr.s])].map((item, j) => (
                    <label key={j} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-50 cursor-pointer">
                      <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
                      <span className="text-sm text-gray-700">{item}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        )}

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
