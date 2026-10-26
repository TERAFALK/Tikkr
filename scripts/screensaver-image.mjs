/**
 * Ritar stämplingsskärmens skärmsläckare: den staplade logotypen mitt på
 * Fjord, i skärmens upplösning.
 *
 *   node scripts/screensaver-image.mjs
 *
 * Skärmsläckaren pekade först direkt på logotypens SVG. ProMGR visade den
 * då som en webbsida, vit bakgrund och logotypen i övre vänstra hörnet. En
 * bild i skärmens egen storlek har inget att placera, och ser likadan ut
 * oavsett hur appen skalar den.
 *
 * Logotypen hämtas ur varumärkesmappen och ritas aldrig om. Körs igen när
 * materialet i brand/ byts ut.
 */
import path from "node:path";
import sharp from "sharp";

const WIDTH = 1920;
const HEIGHT = 1080;
const FJORD = "#0E1A2B";
// En dryg tredjedel av höjden: läsbar på några meters håll, och mörk yta nog
// runt om för att ljuset ska kunna ligga lågt.
const LOGO_HEIGHT = 400;

const root = process.cwd();
const source = path.join(root, "brand", "01-logo", "svg", "tikkr-logo-stacked-reversed.svg");
const target = path.join(root, "public", "brand", "tikkr-skarmslackare-1920x1080.png");

const logo = await sharp(source, { density: 600 })
  .resize({ height: LOGO_HEIGHT })
  .png()
  .toBuffer();

await sharp({
  create: { width: WIDTH, height: HEIGHT, channels: 3, background: FJORD },
})
  .composite([{ input: logo, gravity: "center" }])
  .png({ compressionLevel: 9 })
  .toFile(target);

console.log(`Skrev ${path.relative(root, target)}`);
