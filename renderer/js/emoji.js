window.Emoji = (function () {
  const SKIN_MODS = ["", "\u{1F3FB}", "\u{1F3FC}", "\u{1F3FD}", "\u{1F3FE}", "\u{1F3FF}"];
  const RK = "gc_emoji_recent", SK = "gc_emoji_skin";

  const NAMES = {
    "\u{1F600}":"grinning smiley","\u{1F603}":"smiley happy","\u{1F604}":"smile happy",
    "\u{1F601}":"beaming grin","\u{1F606}":"relieved smile","\u{1F605}":"sweat smile",
    "\u{1F602}":"joy tears happy","\u{1F923}":"rofl laughing","\u{1F60A}":"star smile love",
    "\u{1F607}":"innocent halo angel","\u{1F608}":"smiling devil horns",
    "\u{1F609}":"wink","\u{1F60C}":"relieved content","\u{1F60D}":"heart eyes love",
    "\u{1F970}":"smiling hearts love","\u{1F618}":"kiss love heart","\u{1F617}":"kissing smile",
    "\u{1F619}":"kissing smile","\u{1F61A}":"kissing closed eyes",
    "\u{1F60B}":"yummy savoring","\u{1F61B}":"tongue playful",
    "\u{1F61C}":"wink tongue geek","\u{1F61D}":"squinting tongue",
    "\u{1F911}":"money mouth","\u{1F917}":"hugging face hug",
    "\u{1F92D}":"hand over mouth oops","\u{1F92B}":"palm speak",
    "\u{1F910}":"thinking face hmm","\u{1F914}":"hmm think",
    "\u{1F928}":"raised eyebrow skeptical","\u{1F92F}":"mind blown exploded",
    "\u{1F644}":"rolling eyes","\u{1F610}":"neutral expressionless",
    "\u{1F636}":"without mouth silent","\u{1F60F}":"smirk sly",
    "\u{1F612}":"unamused annoyed","\u{1F645}":"no gesture negative",
    "\u{1F646}":"ok gesture positive","\u{1F614}":"pensive sad",
    "\u{1F62D}":"crying tears sad","\u{1F62C}":"grimacing worried",
    "\u{1F625}":"disappointed relieved","\u{1F630}":"anxious sweat worried",
    "\u{1F628}":"worried fear","\u{1F631}":"scream fear shocked",
    "\u{1F620}":"angry mad","\u{1F621}":"rage pouting",
    "\u{1F624}":"triumph frustrated","\u{1F629}":"weary tired",
    "\u{1F62B}":"tired weary","\u{1F622}":"cry sad",
    "\u{1F62A}":"sleepy tired","\u{1F635}":"dizzy faint",
    "\u{1F613}":"cold sweat nervous","\u{1F61F}":"worried fear",
    "\u{1F626}":"frowning disappointed","\u{1F627}":"anguish pained",
    "\u{1F62E}":"surprised shocked","\u{1F62F}":"hushed surprised",
    "\u{1F632}":"astonished amazement","\u{1F633}":"flushed embarrassed",
    "\u{1F637}":"medical mask sick","\u{1F912}":"thermometer sick",
    "\u{1F915}":"bandage injured","\u{1F922}":"nauseated sick",
    "\u{1F92E}":"vomiting sick","\u{1F927}":"sneezing achoo",
    "\u{1F648}":"monkey see","\u{1F649}":"monkey hear","\u{1F64A}":"monkey speak",
    "\u{1F64B}":"raising hand","\u{1F91A}":"back hand stop",
    "\u{1F44B}":"waving hello","\u{1F91F}":"love you gesture",
    "\u{1F44C}":"ok hand perfect","\u{1F44D}":"thumbs up like yes",
    "\u{1F44E}":"thumbs down dislike","\u{1F44F}":"clapping applause",
    "\u{1F64C}":"raising hands praise","\u{1F450}":"open hands",
    "\u{1F932}":"palms up together","\u{1F91D}":"handshake deal",
    "\u{1F446}":"point up index","\u{1F447}":"point down index",
    "\u{1F449}":"point right index","\u{1F448}":"point left index",
    "\u{1F4AA}":"flexed biceps muscle","\u{1F44A}":"punch fist bump",
    "\u{1F91C}":"fist right","\u{1F91B}":"fist left",
    "\u{1F918}":"rock on horns","\u{1F91E}":"crossed fingers luck",
    "\u{1F440}":"eyes looking","\u{1F443}":"nose smell",
    "\u{1F445}":"tongue lick","\u{1F444}":"mouth lips",
    "\u{1F48B}":"kiss lips love","\u{1F4AF}":"100 score perfect",
    "\u{2764}\uFE0F":"red heart love","\u{1F494}":"broken heart sad",
    "\u{1F495}":"two hearts love","\u{1F496}":"sparkling heart",
    "\u{1F497}":"growing heart","\u{1F498}":"heart arrow cupid",
    "\u{1F499}":"blue heart","\u{1F49A}":"green heart",
    "\u{1F49B}":"yellow heart","\u{1F49C}":"purple heart",
    "\u{1F5A4}":"black heart dark","\u{1F90E}":"brown heart",
    "\u{1F9E1}":"orange heart","\u{1F49D}":"heart ribbon gift",
    "\u{1F49E}":"revolving hearts couple","\u{2763}\uFE0F":"heart exclamation",
    "\u{1F468}":"man male person","\u{1F469}":"woman female person",
    "\u{1F474}":"old man elderly","\u{1F475}":"old woman elderly",
    "\u{1F46B}":"couple man woman love","\u{1F46C}":"couple men gay",
    "\u{1F46D}":"couple women lesbian","\u{1F476}":"baby infant",
    "\u{1F477}":"construction worker hard hat","\u{1F478}":"princess fairy",
    "\u{1F934}":"prince royal","\u{1F935}":"tuxedo groom wedding",
    "\u{1F470}":"veil bride wedding","\u{1F930}":"pregnant person",
    "\u{1F9D2}":"child kid young","\u{1F9D3}":"older person senior",
    "\u{1F9D4}":"beard facial hair","\u{1F9D5}":"headscarf hijab",
    "\u{1F9D6}":"person sauna","\u{1F9D7}":"person climbing boulder",
    "\u{1F9D8}":"person yoga meditating","\u{1F9D9}":"mage wizard magic",
    "\u{1F9DA}":"fairy wings fantasy","\u{1F9DB}":"vampire fangs fantasy",
    "\u{1F9DC}":"mermaid ocean fantasy","\u{1F9DD}":"elf ears fantasy",
    "\u{1F9DE}":"genie magic fantasy","\u{1F9DF}":"zombie dead fantasy",
    "\u{1F468}\u200D\u{1F680}":"man astronaut space",
    "\u{1F469}\u200D\u{1F680}":"woman astronaut space",
    "\u{1F468}\u200D\u{1F3A8}":"man artist painting",
    "\u{1F469}\u200D\u{1F3A8}":"woman artist painting",
    "\u{1F468}\u200D\u{1F393}":"man student graduation",
    "\u{1F469}\u200D\u{1F393}":"woman student graduation",
    "\u{1F468}\u200D\u{1F3EB}":"man teacher education",
    "\u{1F469}\u200D\u{1F3EB}":"woman teacher education",
    "\u{1F468}\u200D\u{2695}\uFE0F":"man doctor medical",
    "\u{1F469}\u200D\u{2695}\uFE0F":"woman doctor medical",
    "\u{1F468}\u200D\u{1F4BB}":"man technologist coding",
    "\u{1F469}\u200D\u{1F4BB}":"woman technologist coding",
    "\u{1F468}\u200D\u{1F4BC}":"man office worker",
    "\u{1F469}\u200D\u{1F4BC}":"woman office worker",
    "\u{1F468}\u200D\u{1F373}":"man chef cooking",
    "\u{1F469}\u200D\u{1F373}":"woman chef cooking",
    "\u{1F468}\u200D\u{1F33E}":"man farmer rural",
    "\u{1F469}\u200D\u{1F33E}":"woman farmer rural",
    "\u{1F468}\u200D\u{1F52C}":"man scientist research",
    "\u{1F469}\u200D\u{1F52C}":"woman scientist research",
    "\u{1F468}\u200D\u{1F3A4}":"man singer music",
    "\u{1F469}\u200D\u{1F3A4}":"woman singer music",
    "\u{1F468}\u200D\u{2696}\uFE0F":"man judge law",
    "\u{1F469}\u200D\u{2696}\uFE0F":"woman judge law",
    "\u{1F468}\u200D\u{1F9B0}":"man red hair ginger",
    "\u{1F468}\u200D\u{1F9B1}":"man curly hair",
    "\u{1F468}\u200D\u{1F9B2}":"man bald","\u{1F468}\u200D\u{1F9B3}":"man white hair",
    "\u{1F469}\u200D\u{1F9B0}":"woman red hair ginger",
    "\u{1F469}\u200D\u{1F9B1}":"woman curly hair",
    "\u{1F469}\u200D\u{1F9B2}":"woman bald","\u{1F469}\u200D\u{1F9B3}":"woman white hair",
    "\u{1F33E}":"rice plant grain","\u{1F33F}":"herb leaf plant",
    "\u{1F340}":"four leaf clover lucky","\u{1F335}":"cactus plant desert",
    "\u{1F334}":"palm tree tropical","\u{1F333}":"deciduous tree",
    "\u{1F332}":"evergreen tree pine","\u{1F331}":"seedling sprout",
    "\u{1F33B}":"sunflower","\u{1F33A}":"hibiscus flower",
    "\u{1F337}":"tulip flower","\u{1F33C}":"blossom flower",
    "\u{1F338}":"cherry blossom sakura","\u{1F339}":"rose flower red",
    "\u{1F33D}":"ear corn maize","\u{1F344}":"mushroom food",
    "\u{1F341}":"maple leaf autumn","\u{1F342}":"fallen leaf autumn",
    "\u{1F343}":"leaf fluttering wind",
    "\u{1F347}":"grapes fruit","\u{1F348}":"melon fruit",
    "\u{1F349}":"watermelon summer","\u{1F34A}":"tangerine orange",
    "\u{1F34B}":"lemon fruit","\u{1F34C}":"banana fruit",
    "\u{1F34D}":"pineapple fruit","\u{1F34E}":"apple red fruit",
    "\u{1F34F}":"green apple","\u{1F350}":"pear fruit",
    "\u{1F351}":"peach fruit","\u{1F352}":"cherries fruit",
    "\u{1F353}":"strawberry fruit","\u{1F95D}":"kiwi fruit",
    "\u{1F345}":"tomato fruit vegetable","\u{1F952}":"avocado fruit",
    "\u{1F955}":"carrot vegetable","\u{1F954}":"pepper vegetable spicy",
    "\u{1F336}\uFE0F":"hot pepper spicy food",
    "\u{1F953}":"bacon breakfast","\u{1F354}":"hamburger burger fast",
    "\u{1F355}":"pizza slice","\u{1F32E}":"taco mexican",
    "\u{1F32F}":"burrito mexican","\u{1F959}":"falafel food",
    "\u{1F9C0}":"cheese wedge","\u{1F356}":"meat bone food",
    "\u{1F357}":"poultry leg chicken","\u{1F969}":"steak meat",
    "\u{1F373}":"cooking egg frying pan","\u{1F9C6}":"egg breakfast",
    "\u{1F372}":"pot stew","\u{1F958}":"fondue cheese pot",
    "\u{1F371}":"bento box lunch","\u{1F95B}":"milk glass drink",
    "\u{2615}":"coffee cup drink hot tea","\u{1F375}":"teacup tea hot beverage",
    "\u{1F376}":"sake bottle alcohol","\u{1F37C}":"baby bottle milk",
    "\u{1F9C3}":"beverage box juice","\u{1F964}":"cup straw water",
    "\u{1F378}":"wine glass alcohol","\u{1F377}":"wine drink",
    "\u{1F943}":"beer bottle alcohol","\u{1F37A}":"beer mug alcohol",
    "\u{1F37B}":"clinking beers cheers","\u{1F942}":"clinking glasses celebration",
    "\u{1F36A}":"cookie dessert sweet","\u{1F36B}":"chocolate bar sweet",
    "\u{1F36C}":"candy sweet","\u{1F36D}":"lollipop candy sweet",
    "\u{1F36E}":"custard dessert","\u{1F36F}":"honey pot sweet",
    "\u{1F370}":"shortcake dessert slice","\u{1F382}":"birthday cake celebration",
    "\u{1F35D}":"waffle breakfast sweet","\u{1F9C4}":"garlic cooking",
    "\u{1F9C5}":"onion cooking","\u{1F35E}":"bread food",
    "\u{1F3C6}":"trophy winner award","\u{1F3C5}":"sports medal running",
    "\u{1F947}":"gold medal first","\u{1F948}":"silver medal second",
    "\u{1F949}":"bronze medal third","\u{26BD}":"soccer ball football",
    "\u{26BE}":"baseball sport","\u{1F3C0}":"basketball ball",
    "\u{1F3D0}":"volleyball sport","\u{26C4}":"snowman winter snowball",
    "\u{1F3C8}":"football american ball","\u{1F3BE}":"tennis racket sport",
    "\u{1F3C3}":"running person exercise","\u{1F3CB}":"weightlifting gym",
    "\u{1F938}":"cartwheeling gymnastics","\u{1F93C}":"wrestling sport",
    "\u{1F93D}":"water polo sport","\u{1F3CA}":"swimmer water sport",
    "\u{26F7}":"skier winter sport","\u{1F3C2}":"snowboarder winter",
    "\u{1F3C4}":"surfer water sport","\u{1F6A3}":"rowing boat sport",
    "\u{1F3C7}":"horse racing jockey","\u{1F93E}":"volleyball person",
    "\u{1F93A}":"fencer fencing sport","\u{1F3AF}":"bullseye target darts",
    "\u{1F3AE}":"video game controller play","\u{1F579}\uFE0F":"joystick game",
    "\u{1F3B0}":"slot machine jackpot","\u{1F3B2}":"game die dice random",
    "\u{1F0CF}":"joker card wild","\u{1F3B1}":"pool billiards 8 ball",
    "\u{1F3B3}":"bowling sport","\u{2660}\uFE0F":"spade card suit",
    "\u{2665}\uFE0F":"heart card suit","\u{2666}\uFE0F":"diamond card suit",
    "\u{2663}\uFE0F":"club card suit",
    "\u{1F3B8}":"guitar music instrument rock","\u{1F3B5}":"musical note music",
    "\u{1F3B6}":"musical notes song","\u{1F3B9}":"keyboard piano music",
    "\u{1F3BA}":"trumpet music jazz","\u{1F3BB}":"violin music classical",
    "\u{1FA95}":"banjo music instrument","\u{1F3B7}":"saxophone jazz music",
    "\u{1F3B4}":"score musical notes","\u{1F3A4}":"microphone karaoke",
    "\u{1F3A7}":"headphones music listen","\u{1F3AD}":"performing arts theater mask",
    "\u{1F3A8}":"artist palette painting art",
    "\u{1F56F}\uFE0F":"candle light","\u{1F4A1}":"light bulb idea bright",
    "\u{1F4D6}":"book open read","\u{1F4DA}":"books stack reading",
    "\u{1F4D5}":"notebook book","\u{1F4DD}":"memo pencil write note",
    "\u{1F4C3}":"page curling paper","\u{1F4C4}":"page document",
    "\u{1F4C5}":"calendar date schedule","\u{1F4C8}":"chart increasing trend up",
    "\u{1F4C9}":"chart decreasing trend down","\u{1F4CA}":"bar chart graph data",
    "\u{1F4D1}":"label price tag","\u{1F4E2}":"loudspeaker announcement",
    "\u{1F4E3}":"megaphone speaker","\u{1F4E1}":"satellite antenna signal",
    "\u{1F4E0}":"desktop computer monitor","\u{1F4BB}":"laptop computer work code",
    "\u{1F4BD}":"minidisc storage","\u{1F4BE}":"floppy disk save",
    "\u{1F4BF}":"optical disc cd dvd","\u{1F4C0}":"dvd disc movie",
    "\u{1F4E6}":"package box delivery","\u{1F4E7}":"email envelope mail",
    "\u{2709}\uFE0F":"envelope letter mail","\u{1F4EA}":"mailbox closed",
    "\u{1F4EB}":"mailbox mail post","\u{1F4EE}":"postbox mail letter",
    "\u{1F4F0}":"newspaper news","\u{1F4F1}":"iphone phone mobile",
    "\u{1F4F2}":"mobile phone receive text","\u{1F4F7}":"camera photo picture",
    "\u{1F4F8}":"camera flash photo","\u{1F4F9}":"video camera movie",
    "\u{1F4FA}":"television tv screen","\u{1F4FB}":"radio music",
    "\u{1F3A4}":"microphone recording","\u{1F4FC}":"vhs video tape retro",
    "\u{1F50A}":"speaker volume loud sound","\u{1F50B}":"battery full charge",
    "\u{231A}":"watch time wrist","\u{231B}":"hourglass done time",
    "\u{23F3}":"hourglass running time","\u{23F0}":"alarm clock morning",
    "\u{1F511}":"key lock security","\u{1F512}":"locked lock",
    "\u{1F513}":"unlocked open lock","\u{1F4A3}":"bomb explosion boom",
    "\u{1F4A5}":"collision crash boom","\u{1F4A6}":"sweat droplets splash",
    "\u{1F4A7}":"droplet water drop","\u{1F4AB}":"dizzy stars sparkle",
    "\u{1F4AC}":"speech bubble talk","\u{1F4AD}":"thought bubble think",
    "\u{1F383}":"jack o lantern halloween pumpkin","\u{1F384}":"christmas tree holiday",
    "\u{1F385}":"santa claus christmas","\u{1F936}":"mrs claus christmas",
    "\u{1F386}":"fireworks celebration","\u{1F387}":"sparkler fireworks",
    "\u{1F388}":"balloon party","\u{1F389}":"party popper tada",
    "\u{1F38A}":"confetti ball","\u{1F381}":"gift present birthday",
    "\u{1F38B}":"tanabata tree","\u{1F380}":"ribbon bow decoration",
    "\u{1F3AB}":"ticket event cinema","\u{1F3AA}":"circus tent performance",
    "\u{1F680}":"rocket space launch","\u{1F6F0}\uFE0F":"satellite space",
    "\u{1F30D}":"globe europe africa world","\u{1F30E}":"globe americas world",
    "\u{1F30F}":"globe asia world","\u{2B50}":"star shining sparkle",
    "\u{2B55}":"circle o ring","\u{274C}":"cross mark no wrong",
    "\u{2753}":"question mark red","\u{2757}":"exclamation mark red",
    "\u{203C}\uFE0F":"double exclamation","\u{2049}\uFE0F":"exclamation question",
    "\u{1F4AF}":"100 score perfect hundred",
    "\u{1F6E1}\uFE0F":"shield protection security","\u{26A0}\uFE0F":"warning sign caution",
    "\u{26D4}":"no entry forbidden","\u{1F6A7}":"construction sign road",
    "\u{1F6A8}":"rotating light police","\u{2692}\uFE0F":"hammer pick tools",
    "\u{2699}\uFE0F":"gear settings","\u{1F527}":"wrench repair tools",
    "\u{1F528}":"hammer construction","\u{2696}\uFE0F":"scale justice law",
    "\u{1F52C}":"microscope science lab","\u{1F52D}":"telescope astronomy space",
    "\u{1F9EA}":"test tube science","\u{1F9EB}":"petri dish science",
    "\u{1F5FE}":"japan map country","\u{2602}\uFE0F":"umbrella rain",
    "\u{2603}\uFE0F":"snowman winter cold","\u{26C5}":"sun behind cloud partly",
    "\u{1F327}\uFE0F":"cloud lightning thunder","\u{1F32A}\uFE0F":"tornado storm wind",
    "\u{1F32B}\uFE0F":"fog mist","\u{1F300}":"cyclone storm",
    "\u{1F301}":"foggy fog","\u{1F302}":"open umbrella rain",
    "\u{2600}\uFE0F":"sun bright sunny","\u{1F303}":"star night sky",
    "\u{1F304}":"sunrise mountain morning","\u{1F305}":"sunrise city morning",
    "\u{1F306}":"cityscape night evening","\u{1F307}":"sunset evening",
    "\u{1F308}":"rainbow colorful","\u{1F30A}":"water wave sea ocean",
    "\u{1F30B}":"volcano mountain","\u{1F30C}":"milky way galaxy stars",
    "\u{26C8}\uFE0F":"hot springs thermal","\u{26F5}":"sailboat boat water",
    "\u{2693}":"anchor ship nautical","\u{26FD}":"fuel pump gas station",
    "\u{1F3E0}":"house home building","\u{1F3E1}":"house garden home",
    "\u{1F3E2}":"office building work","\u{1F3E3}":"post office mail",
    "\u{1F3E5}":"hospital medical health","\u{1F3E6}":"bank money finance",
    "\u{1F3E8}":"hotel travel","\u{1F3EA}":"convenience store shop",
    "\u{1F3EB}":"school education","\u{1F3EC}":"department store shopping",
    "\u{1F3EF}":"japanese castle travel","\u{1F3F0}":"european castle palace",
    "\u{1F5FC}":"tokyo tower landmark","\u{1F5FD}":"statue liberty landmark",
    "\u{1F5FB}":"mount fuji japan nature",
    "\u{1F442}":"ear hear","\u{1F440}":"eyes looking see"
  };

  const SKIN_BASES = new Set([
    "\u{1F44B}","\u{1F44C}","\u{1F44D}","\u{1F44E}","\u{1F44F}","\u{1F450}",
    "\u{1F44A}","\u{1F91C}","\u{1F91B}","\u{1F590}\uFE0F","\u{1F596}","\u{1F595}",
    "\u{1F446}","\u{1F447}","\u{1F448}","\u{1F449}","\u{1F442}","\u{1F443}",
    "\u{270A}","\u{270B}","\u{1F91F}","\u{1F91E}","\u{1F91D}","\u{1F918}",
    "\u{1F468}","\u{1F469}","\u{1F466}","\u{1F467}","\u{1F474}","\u{1F475}",
    "\u{1F476}","\u{1F477}","\u{1F478}","\u{1F934}","\u{1F935}","\u{1F470}",
    "\u{1F9D2}","\u{1F9D3}","\u{1F9D4}","\u{1F9D5}","\u{1F9D6}","\u{1F9D7}",
    "\u{1F9D8}","\u{1F9D9}","\u{1F9DA}","\u{1F9DB}","\u{1F9DC}","\u{1F9DD}",
    "\u{1F9DE}","\u{1F9DF}","\u{1F930}","\u{1F931}","\u{1F932}",
    "\u{1F468}\u200D\u{1F680}","\u{1F469}\u200D\u{1F680}",
    "\u{1F468}\u200D\u{1F3A8}","\u{1F469}\u200D\u{1F3A8}",
    "\u{1F468}\u200D\u{1F393}","\u{1F469}\u200D\u{1F393}",
    "\u{1F468}\u200D\u{1F3EB}","\u{1F469}\u200D\u{1F3EB}",
    "\u{1F468}\u200D\u{2695}\uFE0F","\u{1F469}\u200D\u{2695}\uFE0F",
    "\u{1F468}\u200D\u{1F4BB}","\u{1F469}\u200D\u{1F4BB}",
    "\u{1F468}\u200D\u{1F4BC}","\u{1F469}\u200D\u{1F4BC}",
    "\u{1F468}\u200D\u{1F373}","\u{1F469}\u200D\u{1F373}",
    "\u{1F468}\u200D\u{1F33E}","\u{1F469}\u200D\u{1F33E}",
    "\u{1F468}\u200D\u{1F52C}","\u{1F469}\u200D\u{1F52C}",
    "\u{1F468}\u200D\u{1F3A4}","\u{1F469}\u200D\u{1F3A4}",
    "\u{1F468}\u200D\u{2696}\uFE0F","\u{1F469}\u200D\u{2696}\uFE0F",
    "\u{1F468}\u200D\u{1F9B0}","\u{1F468}\u200D\u{1F9B1}",
    "\u{1F468}\u200D\u{1F9B2}","\u{1F468}\u200D\u{1F9B3}",
    "\u{1F469}\u200D\u{1F9B0}","\u{1F469}\u200D\u{1F9B1}",
    "\u{1F469}\u200D\u{1F9B2}","\u{1F469}\u200D\u{1F9B3}",
    "\u{1F46B}","\u{1F46C}","\u{1F46D}"
  ]);

  const CATEGORIES = {
    Recent: "",
    Smileys: "grinning smiley smile face happy joy beaming relieved sweat tears rofl star innocent wink wink content heart eyes love kiss kiss yummy tongue tongue geek nerd money mouth hugging oops speak thinking think hmm skeptical mind blown rolling eyes expressionless silent smirk annoyed no yes pensive crying grimacing disappointed anxious worried fear scream angry rage triumph weary tired cry dizzy faint nervous shocked surprised astonished flushed mask sick ill injured sneeze",
    People: "person man woman old boy girl family father mother son daughter child kid baby construction worker princess prince groom bride pregnant breastfeeding elderly person mage wizard fairy vampire mermaid elf genie zombie astronaut artist student teacher doctor firefighter farmer technologist office worker scientist singer chef pilot mechanic bald curly red hair ginger",
    Hands: "fingers hand stop hello wave love ok like approve dislike clapping applause raising hands clap index pointing up down left right deal thumb fist sign horns crossed fingers luck hope",
    Nature: "plant nature leaf clover cactus palm tree seedling flower sunflower hibiscus tulip blossom cherry rose garden ear corn mushroom autumn maple fallen fluttering wind insect bug bee butterfly ant ladybug cricket spider web scorpion turtle snake lizard whale dolphin fish tropical blowfish octopus squid shrimp lobster crab snail eagle owl vulture flamingo parrot turkey dove chick chicken horse ram ewe goat deer moose sloth otter beaver mammoth mosquito microbe bat dove",
    Food: "fruit vegetable grape melon watermelon tangerine lemon banana pineapple apple green pear peach cherry strawberry kiwi tomato avocado carrot corn pepper sandwich cheese meat poultry steak bacon hamburger pizza taco burrito falafel egg cooking stew spoon fork chopsticks plate dining milk tea sake baby bottle beverage juice cup water wine beer clink celebration waffle garlic onion cookie chocolate candy lollipop custard honey shortcake cake birthday spicy cooking breakfast lunch dinner drink",
    Activities: "trophy medal gold silver bronze sports soccer baseball basketball volleyball ball puck hockey football tennis running weightlifting gymnastics wrestling water polo swimmer skier snowboarder surfer rowing horse racing fencing skate billiards bowling gaming joystick gambling ace card game musical notes guitar keyboard trumpet violin banjo saxophone score singing karaoke paint artist theater mask tent party lantern light idea reading book notebook pencil calendar chart label ledger",
    Travel: "rocket satellite planet space star ring earth world japan map mountain peak camping beach building construction crane houses cityscape stadium classical desert island national park house home office post office hospital bank hotel store school castle tower liberty fuji boat sailboat anchor fuel caution entry construction light wheel umbrella snowman sun cloud lightning storm tornado fog mist wind sea volcano bay bridge morning evening night car taxi bus train ship plane airport seat tent luggage map globe",
    Objects: "phone mobile camera video television radio microphone headphones alarm clock watch hourglass key lock bomb explosion droplet dizzy speech thought heart exclamation candle lightbulb book books notebook pencil paper calendar chart label ledger loudspeaker satellite antenna computer laptop floppy disc dvd package inbox email letter postbox newspaper scissors gun bow knife sword wrench hammer pick gear nut bolt microscope telescope"
  };

  function getRecent() {
    try { return JSON.parse(localStorage.getItem(RK)) || []; } catch { return []; }
  }
  function addRecent(ch) {
    let r = getRecent().filter(x => x !== ch);
    r.unshift(ch);
    if (r.length > 30) r.length = 30;
    localStorage.setItem(RK, JSON.stringify(r));
  }
  function getSkinPref() { return parseInt(localStorage.getItem(SK)) || 0; }
  function setSkinPref(i) { localStorage.setItem(SK, String(i)); }

  function applySkin(emoji, idx) {
    const base = emoji.replace(/[\u{1F3FB}-\u{1F3FF}]/gu, "");
    if (idx > 0 && SKIN_BASES.has(base)) return base + SKIN_MODS[idx];
    return emoji;
  }

  function buildPicker(container, onSelect) {
    const skinIdx = getSkinPref();
    let activeCat = "Recent", filter = "", activeSkin = skinIdx;

    container.innerHTML = "";
    container.style.cssText = "display:flex;flex-direction:column;height:380px;width:360px;border:1px solid #444;border-radius:8px;background:#2b2d31;color:#fff;font-family:sans-serif;overflow:hidden;";

    const search = document.createElement("input");
    search.placeholder = "Search emoji\u2026";
    search.style.cssText = "margin:8px;padding:8px;border-radius:6px;border:1px solid #555;background:#1e1f22;color:#fff;font-size:14px;outline:none;";
    container.appendChild(search);

    const tabs = document.createElement("div");
    tabs.style.cssText = "display:flex;gap:2px;padding:0 8px;overflow-x:auto;flex-shrink:0;";
    container.appendChild(tabs);

    const icons = {Recent:"\u{1F550}",Smileys:"\u{1F600}",People:"\u{1F469}",Hands:"\u{1F44B}",Nature:"\u{1F33F}",Food:"\u{1F34E}",Activities:"\u{1F3AF}",Travel:"\u{2708}\uFE0F",Objects:"\u{1F4A1}",Symbols:"\u{2B50}"};
    const catBtns = {};
    Object.keys(CATEGORIES).forEach(cat => {
      const b = document.createElement("button");
      b.textContent = icons[cat] || "";
      b.title = cat;
      b.style.cssText = "background:none;border:none;font-size:18px;padding:4px 6px;cursor:pointer;border-radius:4px;opacity:0.5;flex-shrink:0;";
      if (cat === activeCat) b.style.opacity = "1";
      b.onclick = () => { activeCat = cat; renderTabs(); renderGrid(); };
      tabs.appendChild(b);
      catBtns[cat] = b;
    });

    function renderTabs() {
      Object.keys(catBtns).forEach(c => catBtns[c].style.opacity = c === activeCat ? "1" : "0.5");
    }

    const grid = document.createElement("div");
    grid.style.cssText = "flex:1;overflow-y:auto;padding:8px;display:grid;grid-template-columns:repeat(8,1fr);gap:2px;align-content:start;";
    container.appendChild(grid);

    const skinBar = document.createElement("div");
    skinBar.style.cssText = "display:flex;gap:4px;padding:8px;border-top:1px solid #444;flex-shrink:0;";
    container.appendChild(skinBar);

    const skinLabels = ["Default","Light","Medium-Light","Medium","Medium-Dark","Dark"];
    SKIN_MODS.forEach((mod, i) => {
      const b = document.createElement("button");
      b.textContent = i === 0 ? "\u{1F44D}" : applySkin("\u{270B}", i);
      b.title = skinLabels[i];
      b.style.cssText = "font-size:20px;background:none;border:none;cursor:pointer;border-radius:50%;padding:2px;" + (i === activeSkin ? "outline:2px solid #5865f2;outline-offset:1px;" : "");
      b.onclick = () => { activeSkin = i; setSkinPref(i); renderSkin(); renderGrid(); };
      skinBar.appendChild(b);
    });
    function renderSkin() {
      skinBar.querySelectorAll("button").forEach((b, i) => {
        b.style.outline = i === activeSkin ? "2px solid #5865f2" : "none";
      });
    }

    function renderGrid() {
      grid.innerHTML = "";
      let emojis;
      if (filter) {
        emojis = Object.entries(NAMES).filter(([, n]) => n.includes(filter.toLowerCase())).map(([ch]) => ch);
      } else if (activeCat === "Recent") {
        emojis = getRecent().filter(ch => NAMES[ch]);
      } else {
        const kw = CATEGORIES[activeCat];
        emojis = kw ? Object.entries(NAMES).filter(([, n]) => kw.split(" ").some(k => n.includes(k))).map(([ch]) => ch) : [];
      }
      emojis = [...new Set(emojis)];
      if (!emojis.length) {
        const e = document.createElement("div");
        e.textContent = "No emoji found"; e.style.cssText = "grid-column:1/-1;text-align:center;color:#888;padding:20px;font-size:13px;";
        grid.appendChild(e); return;
      }
      emojis.forEach(ch => {
        const btn = document.createElement("button");
        btn.textContent = activeSkin ? applySkin(ch, activeSkin) : ch;
        btn.title = NAMES[ch] || "";
        btn.style.cssText = "background:none;border:none;font-size:24px;cursor:pointer;border-radius:4px;padding:4px;text-align:center;aspect-ratio:1;";
        btn.onmouseenter = () => btn.style.background = "#3a3c41";
        btn.onmouseleave = () => btn.style.background = "none";
        btn.onclick = () => {
          addRecent(ch);
          if (onSelect) onSelect(activeSkin ? applySkin(ch, activeSkin) : ch);
        };
        grid.appendChild(btn);
      });
    }

    let debounce;
    search.addEventListener("input", () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => { filter = search.value.trim(); renderGrid(); }, 150);
    });

    renderGrid();
    return { refresh: renderGrid };
  }

  return { buildPicker, applySkin, NAMES, SKIN_MODS };
})();
