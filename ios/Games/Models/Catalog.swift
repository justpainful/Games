import Foundation

/// نوع اللعبة — يحدّد أي شاشة لعب تُفتح.
public enum GameMode: String, Codable, Sendable {
    case typing   // كتابة بجولات
    case board    // شبكة خانات
    case duel     // مواجهة ثنائية
    case wheel    // عجلة
    case poll     // تصويت
    case phase    // أطوار (مافيا، كراسي، اختباء)
    case teams    // تقسيم فرق
}

public struct GameInfo: Identifiable, Hashable, Sendable {
    public let id: String        // نفس مفتاح الخادم
    public let title: String     // الاسم الرسمي داخل التطبيق
    public let tagline: String
    public let howTo: String
    public let symbol: String    // SF Symbol
    public let mode: GameMode
    public let minPlayers: Int
    public let maxPlayers: Int
    /// هل يمكن لعبها منفردًا ضد البوت الذكي؟
    public let soloable: Bool
}

/// كتالوج الألعاب.
///
/// الأسماء هنا **رسمية فصيحة** وتختلف عمدًا عن أسماء أوامر ديسكورد: الأمر
/// المكتوب في الشات يُختصر للسرعة (`فكك`)، أما التطبيق فواجهة تُقرأ لا تُكتب،
/// فيليق بها الاسم الكامل (`التفكيك`). المفتاح `id` وحده هو الجسر بين السطحين.
public enum Catalog {
    public static let all: [GameInfo] = words + duels + groups

    // ————— ألعاب الكلمات والمعرفة —————
    public static let words: [GameInfo] = [
        GameInfo(id: "asraa", title: "الأسرع", tagline: "أسرع من يكتب الكلمة",
                 howTo: "تظهر كلمة، واكتبها كما هي بأسرع ما يمكن. أول من يكتبها صحيحة يأخذ نقطة الجولة.",
                 symbol: "bolt.fill", mode: .typing, minPlayers: 1, maxPlayers: 25, soloable: true),
        GameInfo(id: "jam3", title: "الجمع", tagline: "حوّل المفرد إلى جمع",
                 howTo: "يظهر مفرد الكلمة، واكتب جمعها الصحيح قبل الجميع.",
                 symbol: "square.stack.3d.up.fill", mode: .typing, minPlayers: 1, maxPlayers: 25, soloable: true),
        GameInfo(id: "mufrad", title: "المفرد", tagline: "حوّل الجمع إلى مفرد",
                 howTo: "يظهر جمع الكلمة، واكتب مفردها الصحيح قبل الجميع.",
                 symbol: "square.stack.3d.down.right.fill", mode: .typing, minPlayers: 1, maxPlayers: 25, soloable: true),
        GameInfo(id: "aks", title: "الأضداد", tagline: "اكتب ضد الكلمة",
                 howTo: "تظهر كلمة، واكتب ضدها في المعنى.",
                 symbol: "arrow.left.arrow.right", mode: .typing, minPlayers: 1, maxPlayers: 25, soloable: true),
        GameInfo(id: "fakek", title: "التفكيك", tagline: "فكّك الكلمة حرفًا حرفًا",
                 howTo: "تظهر كلمة، واكتب حروفها مفصولة بمسافات مثل: م د ر س ة.",
                 symbol: "scissors", mode: .typing, minPlayers: 1, maxPlayers: 25, soloable: true),
        GameInfo(id: "rakeb", title: "التركيب", tagline: "ركّب الحروف المبعثرة",
                 howTo: "تظهر حروف مبعثرة، وأعد تركيبها لتكوّن الكلمة الصحيحة.",
                 symbol: "puzzlepiece.fill", mode: .typing, minPlayers: 1, maxPlayers: 25, soloable: true),
        GameInfo(id: "awasim", title: "العواصم", tagline: "عاصمة كل دولة",
                 howTo: "تظهر دولة، واكتب اسم عاصمتها.",
                 symbol: "building.columns.fill", mode: .typing, minPlayers: 1, maxPlayers: 25, soloable: true),
        GameInfo(id: "aalam", title: "الأعلام", tagline: "اعرف الدولة من علمها",
                 howTo: "يظهر علم دولة، واكتب اسمها.",
                 symbol: "flag.fill", mode: .typing, minPlayers: 1, maxPlayers: 25, soloable: true),
        GameInfo(id: "qara", title: "القارات", tagline: "في أي قارة تقع؟",
                 howTo: "تظهر دولة، واكتب القارة التي تقع فيها.",
                 symbol: "globe", mode: .typing, minPlayers: 1, maxPlayers: 25, soloable: true),
        GameInfo(id: "maarifa", title: "المعرفة", tagline: "أسئلة ثقافة عامة",
                 howTo: "سؤال في كل جولة من مجالات متنوعة، وأول إجابة صحيحة تأخذ النقطة.",
                 symbol: "brain.head.profile", mode: .typing, minPlayers: 1, maxPlayers: 25, soloable: true),
        GameInfo(id: "khammen", title: "التخمين", tagline: "خمّن من التلميحات",
                 howTo: "تُكشف ثلاثة تلميحات واحدًا تلو الآخر، وكلما أسرعت زادت فرصتك.",
                 symbol: "questionmark.circle.fill", mode: .typing, minPlayers: 1, maxPlayers: 25, soloable: true),
        GameInfo(id: "arqam", title: "الأرقام", tagline: "مسائل حسابية سريعة",
                 howTo: "تظهر مسألة حسابية، واكتب ناتجها قبل الجميع.",
                 symbol: "number", mode: .typing, minPlayers: 1, maxPlayers: 25, soloable: true),
        GameInfo(id: "hisab", title: "المتتابعات", tagline: "أكمل المتتابعة",
                 howTo: "تظهر متتابعة أرقام ينقصها الحد الأخير. اكتشف القاعدة واكتب الرقم التالي.",
                 symbol: "chart.line.uptrend.xyaxis", mode: .typing, minPlayers: 1, maxPlayers: 25, soloable: true),
        GameInfo(id: "huroof", title: "الحروف", tagline: "كلمة تبدأ بحرف",
                 howTo: "يظهر صف حروف ويُطلب حرف منها. اكتب كلمة عربية تبدأ به.",
                 symbol: "textformat.abc", mode: .typing, minPlayers: 1, maxPlayers: 25, soloable: true),
        GameInfo(id: "kt", title: "الإقصاء", tagline: "أجب لتنجو",
                 howTo: "من يجيب ينجو، ومن يسكت يخرج. تستمر الجولات حتى يبقى لاعب واحد.",
                 symbol: "person.crop.circle.badge.xmark", mode: .typing, minPlayers: 3, maxPlayers: 25, soloable: false),
        GameInfo(id: "event", title: "المسابقة الكبرى", tagline: "كل الأسئلة في جولة واحدة",
                 howTo: "مسابقة طويلة تجمع المعرفة والعواصم والقارات والأعلام معًا.",
                 symbol: "crown.fill", mode: .typing, minPlayers: 1, maxPlayers: 30, soloable: true),
    ]

    // ————— المواجهات —————
    public static let duels: [GameInfo] = [
        GameInfo(id: "xo", title: "إكس أو", tagline: "ثلاثة في صف",
                 howTo: "تُلعب على شبكة 3×3. كوّن صفًا من ثلاث علامات أفقيًا أو عموديًا أو قطريًا لتفوز.",
                 symbol: "xmark.square.fill", mode: .board, minPlayers: 1, maxPlayers: 2, soloable: true),
        GameInfo(id: "eshbek", title: "أربعة في صف", tagline: "أوصل أربعة قبل خصمك",
                 howTo: "أسقط قطعك في الأعمدة، ومن يصنع صفًا من أربع يفوز.",
                 symbol: "circle.grid.3x3.fill", mode: .board, minPlayers: 1, maxPlayers: 2, soloable: true),
        GameInfo(id: "hajra", title: "حجرة ورقة مقص", tagline: "أفضل من ثلاث جولات",
                 howTo: "اختر سرًا، ويُكشف الاختياران معًا. الحجرة تكسر المقص، والمقص يقص الورقة، والورقة تغلف الحجرة.",
                 symbol: "hand.raised.fill", mode: .duel, minPlayers: 1, maxPlayers: 12, soloable: true),
        GameInfo(id: "nard", title: "النرد", tagline: "الحظ وحده",
                 howTo: "ثلاث رميات لكل لاعب، وصاحب أعلى مجموع يفوز.",
                 symbol: "dice.fill", mode: .duel, minPlayers: 1, maxPlayers: 8, soloable: true),
        GameInfo(id: "bomb", title: "القنبلة", tagline: "اكتب قبل الانفجار",
                 howTo: "يظهر مقطع من حرفين، واكتب كلمة تحويه قبل انتهاء وقتك وإلا خرجت.",
                 symbol: "flame.fill", mode: .duel, minPlayers: 2, maxPlayers: 15, soloable: false),
    ]

    // ————— الألعاب الجماعية —————
    public static let groups: [GameInfo] = [
        GameInfo(id: "mafia", title: "المافيا", tagline: "من بينكم القاتل؟",
                 howTo: "تُوزّع الأدوار سرًا. في الليل تقتل المافيا، وفي النهار يصوّت الجميع على المشتبه به.",
                 symbol: "theatermasks.fill", mode: .phase, minPlayers: 5, maxPlayers: 15, soloable: false),
        GameInfo(id: "roulette", title: "الروليت", tagline: "العجلة تختار",
                 howTo: "تدور العجلة بأسماء اللاعبين وتقف على واحد منهم.",
                 symbol: "arrow.triangle.2.circlepath", mode: .wheel, minPlayers: 2, maxPlayers: 20, soloable: false),
        GameInfo(id: "karasi", title: "الكراسي", tagline: "كرسي أقل في كل جولة",
                 howTo: "الكراسي أقل من اللاعبين بواحد، وأسرع من يضغط ينجو. آخر الباقين يفوز.",
                 symbol: "chair.lounge.fill", mode: .phase, minPlayers: 3, maxPlayers: 15, soloable: false),
        GameInfo(id: "hide", title: "الاختباء", tagline: "ابحث عن المختبئ",
                 howTo: "يختبئ لاعب في خانة سرية، ويبحث الباقون عنه بعدد محاولات محدود.",
                 symbol: "eye.slash.fill", mode: .phase, minPlayers: 2, maxPlayers: 12, soloable: false),
        GameInfo(id: "tasweet", title: "التصويت", tagline: "صوّتوا واختاروا",
                 howTo: "يطرح القائد سؤالًا بخيارات، ويصوّت الجميع.",
                 symbol: "checklist", mode: .poll, minPlayers: 2, maxPlayers: 25, soloable: false),
        GameInfo(id: "ghuraf", title: "تقسيم الفرق", tagline: "فرق عشوائية متوازنة",
                 howTo: "يُقسَّم اللاعبون إلى فرق متساوية عشوائيًا.",
                 symbol: "person.3.fill", mode: .teams, minPlayers: 2, maxPlayers: 30, soloable: false),
    ]

    public static func game(_ id: String) -> GameInfo? {
        all.first { $0.id == id }
    }

    /// ما يمكن لعبه وحدك ضد البوت — قسم مستقل في الشاشة الرئيسية.
    public static var soloGames: [GameInfo] { all.filter(\.soloable) }
}
