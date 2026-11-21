/** 0.9.2 分镜版式：从好分镜里学来的写法。每种都带一页完整的示范（@page / @panel / @character），
 *  AI 照着示范写，NAI 才画得出这种分镜——光说「要有艺术感」它画不出来。
 *  分格选「艺术感」时每页必用一种（发完整示范）；「有变化 / 大胆」时只发说明，合适的页借用。 */
const COMIC_BOARDS = [
    {
        id: 'relay', name: '局部接力', when: '登场、逼近、悬念、冷淡的人出场、重逢',
        how: '四条横贯整页的长条格从上往下排，全页不出现全身，只拍局部：走路的腿 → 落地的鞋 → 垂下的手 → 最后一格才露出眼睛。一片落叶在格子之间飘落，跨过格线把四格串起来。',
        page: `@page
rating:general, 1boy, comic, manga, monochrome, greyscale, screentone, 4 panels, horizontal strip panels stacked vertically, wide panels, white gutters, white background, no full body, a falling leaf crossing panel borders, falling leaves, autumn, cold atmosphere, dramatic shadows
@panel P1
strip 1 of 4 at the very top, wide panel, from below, legs walking on wooden floorboards, lower body, out of frame, dappled light, heavy screentone
@character C1
boy, black suit, black trousers, black leather shoes, walking, lower body
@panel P2
strip 2 of 4, foot focus, a polished leather shoe stepping down, blank white background, a leaf drifting down next to the shoe
@panel P3
strip 3 of 4, hand focus, hand hanging relaxed by his side, black suit sleeve, cuff buttons, a leaf passing between the fingers
@character C1
boy, black suit sleeve, pale hand, long fingers
@panel P4
strip 4 of 4 at the bottom, extreme close-up, eye focus, one sharp eye, bangs over the eye, half face, cold expression, deep shadow on the left
@character C1
boy, black hair, grey eyes, sharp eyes, expressionless, close-up
Text: （……回来了。）`,
    },
    {
        id: 'windows', name: '窗格叠全身', when: '唯美、抒情、角色登场、心境变化、梦一样的片刻',
        how: '整页白底，一个全身人物斜着飘在整页中间做底图；上面一排开三个竖长小窗格，放脸部特写和一串连续小动作（低头、喝、吐气）；右下角再开一个竖长格放另一个视角。头发、衣摆、花瓣从人物身上流出去，盖过窗格的边。',
        page: `@page
rating:general, 1girl, comic, illustration, limited palette, navy blue and white, white background, full body figure floating diagonally across the whole page, three small vertical inset panels in a row at the top, one tall inset panel at the bottom right, very long flowing hair spilling over the panel borders, petals, ornate line art, art nouveau, elegant
@panel P1
top left inset panel, close-up, side profile, eyes half closed, navy background
@character C1
girl, very long black wavy hair, pale skin, floral kimono, side profile, eyes half closed
@panel P2
top middle inset panel, close-up, drinking from a small sake cup, eyes closed, navy background
@panel P3
top right inset panel, close-up, exhaling white smoke, looking up, navy background
@panel P4
main image behind the panels, full body, floating in the air, hair and sleeves flowing in swirls, holding her own face with both hands, barefoot
@character C1
girl, very long black wavy hair flowing everywhere, white kimono with blue floral pattern, floating, barefoot, sad
@panel P5
bottom right tall inset panel, from the side, the same girl sinking underwater, bubbles, coral, blue
Text: 那天的酒是甜的。`,
    },
    {
        id: 'blackflow', name: '黑页流体', when: '孤独、失去、离开、时间流逝、回忆被拉走',
        how: '整页涂黑。上面两条宽格画远景：很小的人坐在水边，第二格只剩倒影；倒影像液体一样从第二格底边溢出来，顺着黑色一路往下流，滴进最下面一条横格里的特写（闭着的眼睛、头发）。中间一大片只有黑和流下来的白。',
        page: `@page
rating:general, 1boy, comic, manga, monochrome, black background, large negative space, 3 panels, two wide panels at the top, one wide panel at the bottom, white liquid dripping out of the second panel and flowing down through the black space into the bottom panel, ink flow, surreal, lonely, quiet
@panel P1
top wide panel, extreme wide shot, tiny distant figure sitting on a bench by the water, flowing water lines, empty white space
@character C1
boy, tiny figure, sitting, from behind, scarf
@panel P2
middle wide panel, the same place, only his dark reflection on the water left, ripples, the reflection melting
@panel P3
bottom wide panel, extreme close-up, closed eye, messy black hair, lying down, tear trail, speed lines, screentone
@character C1
boy, black hair, closed eyes, lying, close-up, sad
Text: 等我回头，那里已经没有人了。`,
    },
    {
        id: 'stagger', name: '错位长条加纹样', when: '古风、宫廷、群像、命运感、隔着人群对视',
        how: '五条宽窄不一的横条左右错开排，交替放人物半身、眼部特写、衣饰细节、另一个人的眼睛，两个人的眼睛隔着几格对望。整页底下铺满一种纹样（花藤、星星、水纹），从格子后面伸出来压过格线。',
        page: `@page
rating:general, 1boy, 1girl, comic, illustration, monochrome blue, limited palette, 5 panels, staggered horizontal panels shifted left and right, alternating eye close-up strips, ornate floral vines and flowers growing behind and over the panel borders, patterned background, white background, detailed line art
@panel P1
top panel shifted left, upper body, man in a black embroidered coat, crowd of people in the background, looking at viewer
@character C1
boy, long black hair, dark eyes, black embroidered coat, upper body, serious
@panel P2
second strip shifted right, extreme close-up, his eyes only, eye focus
@panel P3
middle panel shifted left, ornate dress detail, pearls, embroidered sleeves, no face
@panel P4
fourth panel shifted right, upper body, woman in a pearl headdress, looking back
@character C2
girl, black braided hair, pearl headdress, embroidered dress, upper body, looking back
@panel P5
bottom strip, extreme close-up, her eyes only between hanging pearls, eye focus, looking up
Text: 「是你。」`,
    },
    {
        id: 'collage', name: '心理拼贴', when: '崩溃、梦、闪回、内心独白、执念、不安',
        how: '中间一张占半页的大脸（流泪、空洞的眼睛、头发像燃烧的线），周围散落五六个大小不一的小方框放象征物（蜡烛、照片、手势、星空），再加几条黑色横条，像贴满东西的剪贴本，只用一点点红色。',
        page: `@page
rating:general, 1girl, illustration, collage, surreal, greyscale, spot color, red accents, center large face taking half of the page, scattered small frames with symbolic objects around her, black horizontal bars, melting candles on top, torn paper, ink, psychological, unsettling
@panel P1
center large panel, close-up, face with hollow eyes, tears, hair turning into tangled lines like smoke, cracks
@character C1
girl, messy hair, hollow eyes, tears, expressionless, close-up
@panel P2
small frame top left, a single staring eye
@panel P3
small frame right, an old photograph with a smiling face scratched out
@panel P4
small frame bottom left, a hand making a gesture, black background
@panel P5
small frame upper right, night sky with stars through a window
@panel P6
bottom, three small red ribbons hanging from a black bar
Text: （我是不是早就该发现。）`,
    },
    {
        id: 'burst', name: '小格铺垫大格爆发', when: '心动、发现、顿悟、情绪一下子涌上来',
        how: '上半页两个并排小格：一格交代动作，一格是发现的东西的特写；下半页一个超大格画情绪本身，把心动画成冒泡、星星、发光的心之类的象征物，人物只露一半，旁白放大格右下角的方框里，再配一两个拟声。',
        page: `@page
rating:general, 1girl, comic, color, limited palette, blue and black, textured paper, 3 panels, two small panels side by side on top, one huge panel taking the bottom two thirds, symbolic emotion visualization, sparkles, bubbles, glowing heart shape, cute
@panel P1
top right small panel, medium shot, she bends down by the shore and picks up a glass marble, sand, foam
@character C1
girl, short black hair, blue star-patterned scarf, bending down, curious
@panel P2
top left small panel, close-up of the glass marble in the foam, reflected stars and moon, sparkles
@panel P3
bottom huge panel, close-up, half of her face cut off by the frame edge, scarf filling the panel, a big glowing heart made of bubbles bursting beside her, stars, sparkles
@character C1
girl, short black hair, blue star-patterned scarf, wide eyes, blush, partially out of frame
Text: 心里有什么东西一下子冒泡了。
咕嘟`,
    },
    {
        id: 'breakout', name: '出格', when: '对峙、擦肩、告白前一刻、关系转折、动作戏',
        how: '一条竖线把页面切开：左边格子里是一个人的侧脸，右边的人一半在格里、一半走出格子站在留白上，两人的手隔着格线快碰到；两人之间的空白放竖排对白。动作戏就用重叠的斜格、速度线、大号拟声字，人物越过格线冲向读者。',
        page: `@page
rating:general, 2boys, comic, manga, monochrome, 3 panels, vertical split, character breaking out of the panel border, standing on white margin, overlapping panels, hands almost touching across the panel border, vertical speech bubble in the white space, dramatic
@panel P1
left tall panel, close-up, side profile looking down, half the face in shadow, screentone background
@character C1
boy, short messy white hair, side profile, looking down, tank top
@panel P2
right side, full body, a boy walking out of the panel onto the white page margin, reaching his hand toward the left panel
@character C2
boy, black spiky hair, sleeveless shirt, shorts, boots, walking, reaching out
@panel P3
top right small panel, close-up, looking back over the shoulder, surprised
Text: 「……别走。」`,
    },
];
const COMIC_CRAFT = '分镜法（照着做，NAI 才画得出好分镜）：①一页只讲一个瞬间，格子是镜头不是插图；②景别要跳，别连着两格一样的景别：大远景交代地方，特写给情绪，局部（手、脚、眼睛、背影、一个物件）给细节；③能用局部讲的就别画全身，最后一格常常只留眼睛或背影；④这页情绪最重的那一刻给最大的格，铺垫用小格；⑤用一个东西把格子串起来（落叶、头发、水、视线、光），并在 @page 里写明它「crossing panel borders」；⑥留白和涂黑也是格子：安静、孤独时敢写 large negative space、black background；⑦@page 要写出整页的版式（几格、格子形状、怎么排、有没有叠在大图上 / 出格 / 纹样），每个 @panel 开头写它在页面的位置（top left、bottom right inset panel；横条一格格往下的写 strip 1 of 4、strip 2 of 4…）；⑧一页颜色收着用：limited palette、monochrome、spot color 比五颜六色更像作品。';
function comicBoardsText(d, { full = false } = {}) {
    const off = new Set(d?.options?.comicBoardsOff || []);
    return [...COMIC_BOARDS, ...(Array.isArray(d?.comicBoards) ? d.comicBoards : [])].filter(b => b && b.how && !off.has(b.id))
        .map(b => `【${b.name}】适合：${b.when || '都行'}。画法：${b.how}${full && b.page ? `\n示范：\n<image>\n${b.page}\n</image>` : b.tags ? ` 标签：${b.tags}` : ''}`).join('\n\n');
}
