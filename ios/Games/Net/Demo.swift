import Foundation

/// وضع العرض — بيانات ثابتة بلا خادم.
///
/// يُعترَض عند طبقة الشبكة لا داخل كل شاشة: لو عالجت كل شاشة الوضع بنفسها،
/// لظهرت شاشة ناقصة كلما أُضيفت واحدة جديدة ونُسي استثناؤها — وهو ما حدث فعلًا
/// حين ظهرت لوحة الصدارة بخطأ شبكة في لقطات الـ CI بينما البروفايل يعمل.
///
/// يُفعَّل بوسيط الإقلاع `-demo` وحده، فلا سبيل للوصول إليه في تطبيق منشور.
public enum Demo {
    public static var isOn: Bool {
        ProcessInfo.processInfo.arguments.contains("-demo")
    }

    public static let account = Account(
        id: "308994132968210433",
        username: "abdulrahman",
        displayName: "عبدالرحمن",
        avatarHash: nil
    )

    public static let guilds = [
        Guild(id: "1", name: "سيرفر الأصدقاء", iconHash: nil),
        Guild(id: "2", name: "Gaming Lounge", iconHash: nil),
    ]

    public static let points = Points(roulette: 14, team: 62, solo: 137, gamesPlayed: 48, wins: 19)

    /// أسماء متنوّعة عمدًا: عربية طويلة، لاتينية، وواحدة تبدأ بنقطة — فتكشف
    /// اللقطة كسر الاتجاه والقصّ بدل أن تخفيه أسماء قصيرة مثالية.
    public static let leaders: [LeaderRow] = [
        LeaderRow(id: "1", displayName: "عبدالرحمن", avatarHash: nil, points: 137, rank: 1),
        LeaderRow(id: "2", displayName: "Sara_2010", avatarHash: nil, points: 121, rank: 2),
        LeaderRow(id: "3", displayName: ".zja6", avatarHash: nil, points: 98, rank: 3),
        LeaderRow(id: "4", displayName: "نواف الشمري", avatarHash: nil, points: 74, rank: 4),
        LeaderRow(id: "5", displayName: "اسم طويل جدا يتجاوز عرض الصف بكثير", avatarHash: nil, points: 61, rank: 5),
        LeaderRow(id: "6", displayName: "ghost_99", avatarHash: nil, points: 47, rank: 6),
        LeaderRow(id: "7", displayName: "ليان", avatarHash: nil, points: 33, rank: 7),
        LeaderRow(id: "8", displayName: "Mo", avatarHash: nil, points: 21, rank: 8),
        LeaderRow(id: "9", displayName: "خالد", avatarHash: nil, points: 12, rank: 9),
        LeaderRow(id: "10", displayName: "player_x", avatarHash: nil, points: 4, rank: 10),
    ]

    /// يعيد ردًّا معلّبًا للمسار، أو `nil` إن كان المسار غير معروف.
    public static func canned(for path: String) -> (any Encodable)? {
        if path.hasPrefix("/me") { return MeResponse(account: account, guilds: guilds) }
        if path.hasPrefix("/points") { return points }
        if path.hasPrefix("/leaders") { return leaders }
        return nil
    }
}
