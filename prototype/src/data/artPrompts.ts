import type { CardDef, Rarity, Tribe } from "../core/types.ts";

/*
 * カード絵を画像生成AIに描かせるための指示文。
 * 全カード共通の画風(STYLE)に、種族の背景、レア度の豪華さ、カードごとの姿を足して作る。
 * 画像生成AIは英語の指示のほうが安定するので、英語で書く。
 */

export const STYLE =
  "Original creature illustration for a fantasy trading card game. " +
  "Cute but cool chibi monster with a rounded silhouette and big expressive eyes, " +
  "bold clean lineart, soft cel shading with warm rim light, vibrant saturated colors, " +
  "simple painterly background, the whole creature visible and centered with some margin, landscape composition. " +
  "No text, no letters, no numbers, no card frame, no border, no watermark, no humans. " +
  "An original design that does not resemble any existing franchise character.";

const TRIBE_SCENE: Record<Tribe, string> = {
  slime: "Background: a dewy meadow after rain with soft bokeh.",
  beast: "Background: a sunny grassland with tall grass and blue sky.",
  dragon: "Background: volcanic cliffs at dusk with glowing embers.",
  machine: "Background: a cozy workshop with brass gears and warm lamps.",
  spirit: "Background: a misty moonlit shrine path with paper lanterns.",
  plant: "Background: a sunlit forest glade with dappled light.",
};

const RARITY_FLAIR: Record<Rarity, string> = {
  C: "Humble everyday creature, simple palette.",
  U: "Slightly more detailed, a small accessory.",
  R: "A few floating sparkles, confident pose.",
  SR: "Glowing magical aura, dynamic pose, richer detail.",
  SSR: "Epic presence, radiant golden aura and light rays, ornate details, dramatic low-angle view.",
  UR: "Legendary and majestic, rainbow prismatic aura, swirling magic and light rays, highly detailed, awe-inspiring.",
};

/** カードごとの姿。キーはカード名 */
export const LOOKS: Record<string, string> = {
  ぷるスライム: "a small wobbly mint-green jelly slime, slightly translucent, about to split in two",
  しずくスライム: "a water-droplet shaped blue slime with a shiny highlight and a calm smile",
  どろスライム: "a muddy brown slime with little pebbles stuck in it, sleepy eyes",
  あわスライム: "a bubbly foamy pale-cyan slime covered in soap bubbles",
  こいぬ: "an energetic orange puppy creature with floppy ears and a wagging tail",
  のねずみ: "a tiny field mouse creature with big round ears holding a seed",
  いのしし: "a young boar creature with striped fur charging forward",
  ちびトカゲ: "a tiny red lizard creature with stubby legs and a curled tail",
  たまごりゅう: "a baby dragon peeking out of a cracked spotted eggshell",
  こばんトカゲ: "a lizard creature hugging a large oval gold coin",
  ねじ虫: "a mechanical worm creature made of screw threads and bolts",
  はぐるま: "a living brass cog creature with tiny arms and one big eye",
  ブリキ兵: "a tin toy soldier robot with a drum-shaped body and wind-up key",
  ひとだま: "a floating blue will-o'-the-wisp flame spirit with a gentle face",
  こだま: "a small white forest echo spirit with a round head, tilting its head",
  ざしきわらし: "a mischievous lucky house spirit shaped like a little ghost wearing a red bow",
  ふたば: "a sprout creature with two big leaves on its head",
  どんぐり: "an acorn creature wearing its cap like a hat",
  きのこ: "a red spotted mushroom creature puffing spores",
  つぼみ: "a pink flower bud creature about to bloom",
  ぶんれつスライム: "a green slime splitting into two smaller slimes",
  よろいスライム: "a slime wearing a dented knight helmet and a small shield",
  スライムの親分: "a big tough slime boss with a headband and a scar, arms crossed",
  かけるオオカミ: "a lean grey wolf creature sprinting with motion lines",
  ちからグマ: "a muscular brown bear creature flexing its arms",
  まねきこぎつね: "a little fox creature raising one paw in a beckoning pose",
  ひのこトカゲ: "a lizard creature with a flickering flame on its tail and sparks around",
  こりゅう: "a young purple dragon with small wings practicing flight",
  わかりゅう: "an adolescent crimson dragon with growing horns, determined look",
  ばねロボ: "a robot creature bouncing on a big coiled spring",
  ほうだい: "a cannon turret creature with stubby legs and a smoking barrel",
  しゅうりロボ: "a friendly repair robot holding a wrench and a screwdriver",
  ゆうれい: "a classic white sheet ghost with a wavy tail, floating",
  おにび: "a pair of floating purple demon-fire flames with small horns",
  つるくさ: "a vine creature with curling tendrils and leaves",
  ひまわり: "a sunflower creature with a sunny smiling face",
  キングスライム: "a large regal blue slime wearing a small gold crown",
  ぷるぷる大将: "a slime general wearing a samurai kabuto helmet",
  まねきネコ: "a white beckoning cat creature holding a gold koban coin, one paw raised",
  はやてヒョウ: "a swift spotted leopard creature dashing like the wind",
  ほのおりゅう: "a flame dragon breathing a small burst of fire",
  いわりゅう: "a sturdy rock dragon with stone plates and moss",
  たてロボ: "a robot creature holding a huge tower shield",
  ちょきん箱ロボ: "a piggy-bank shaped robot with a coin slot on its back",
  さまよう鎧: "an empty haunted suit of armor with glowing eyes in the helmet",
  たたりがみ: "a dark cursed spirit wrapped in tattered talismans, menacing but cute",
  いやしの花: "a glowing healing flower creature releasing soft green light",
  しんじゅの木: "a small tree creature bearing shining pearls instead of fruit",
  スライムの王冠: "a majestic slime wearing a jeweled crown and a royal cape",
  ぎんろうおう: "a silver wolf king with a flowing mane and a scar over one eye",
  こがねギツネ: "a golden fox with several flowing tails and floating coins",
  くれないりゅう: "a crimson dragon spreading its wings, roaring",
  ねじまき番兵: "a clockwork sentinel robot with a big wind-up key and a shield",
  たいほうロボ: "a heavy robot with shoulder cannons firing",
  しにがみ: "a cute grim reaper spirit in a hooded cloak holding a small scythe",
  よつばの精: "a tiny four-leaf clover sprite creature with leaf wings",
  万年スライム: "an ancient crystalline slime with gems and glowing runes inside it",
  千年樹の番人: "a gentle giant tree guardian with a mossy face and a flower crown",
  てんくうの機兵: "a sky mecha knight with jet wings and a lance, among clouds",
  封印竜アルカ: "a legendary dragon breaking free from glowing rune chains, crown-like horns",
};

export function buildPrompt(card: CardDef): string {
  const look = LOOKS[card.name];
  if (!look) throw new Error(`${card.name} の姿が未定義`);
  return `${STYLE} Subject: ${look}. ${RARITY_FLAIR[card.rarity]} ${TRIBE_SCENE[card.tribe]}`;
}
