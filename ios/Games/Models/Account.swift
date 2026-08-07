import Foundation

/// حساب اللاعب كما يصله من الخادم بعد تسجيل الدخول بديسكورد.
public struct Account: Codable, Hashable, Sendable {
    public let id: String
    /// اسم المستخدم الفريد (بلا مسافات) — للمطابقة لا للعرض
    public let username: String
    /// الاسم الظاهر الذي اختاره المستخدم — **هذا ما يُعرض دائمًا**
    public let displayName: String?
    /// هاش الأفتار من ديسكورد، أو nil لمن لم يضع صورة
    public let avatarHash: String?

    /// ما يُعرض في الواجهة.
    ///
    /// ديسكورد أصبح له ثلاث طبقات أسماء (global_name ثم username ثم legacy)،
    /// وعرض `username` مباشرة يُظهر أسماء مثل `k_9912` بدل الاسم الذي اختاره
    /// اللاعب فعلًا. الأولوية هنا تعكس ما يراه المستخدم داخل ديسكورد نفسه.
    public var shownName: String {
        if let displayName, !displayName.trimmingCharacters(in: .whitespaces).isEmpty {
            return displayName
        }
        return username
    }

    /// رابط صورة الأفتار بحجم مناسب للشاشة.
    ///
    /// من لا صورة له يحصل على أفتار ديسكورد الافتراضي المحسوب من معرّفه،
    /// فلا تظهر دائرة فارغة في البروفايل.
    public func avatarURL(size: Int = 256) -> URL? {
        if let avatarHash {
            let ext = avatarHash.hasPrefix("a_") ? "gif" : "png"
            return URL(string: "https://cdn.discordapp.com/avatars/\(id)/\(avatarHash).\(ext)?size=\(size)")
        }
        // الافتراضي يعتمد على معرّف المستخدم — نفس معادلة ديسكورد
        let index = (UInt64(id).map { ($0 >> 22) % 6 }) ?? 0
        return URL(string: "https://cdn.discordapp.com/embed/avatars/\(index).png")
    }
}

/// محافظ النقاط الثلاث — مطابقة لجداول البوت.
public struct Points: Codable, Hashable, Sendable {
    public let roulette: Int
    public let team: Int
    public let solo: Int
    public let gamesPlayed: Int
    public let wins: Int

    public var total: Int { roulette + team + solo }

    public var winRate: Double {
        gamesPlayed > 0 ? Double(wins) / Double(gamesPlayed) : 0
    }

    public static let empty = Points(roulette: 0, team: 0, solo: 0, gamesPlayed: 0, wins: 0)
}

public struct LeaderRow: Codable, Hashable, Identifiable, Sendable {
    public let id: String          // معرّف اللاعب
    public let displayName: String
    public let avatarHash: String?
    public let points: Int
    public var rank: Int = 0

    public func avatarURL(size: Int = 128) -> URL? {
        Account(id: id, username: displayName, displayName: displayName, avatarHash: avatarHash)
            .avatarURL(size: size)
    }
}

/// السيرفر الذي يشترك فيه اللاعب والبوت — النقاط مفصولة لكل سيرفر.
public struct Guild: Codable, Hashable, Identifiable, Sendable {
    public let id: String
    public let name: String
    public let iconHash: String?

    public func iconURL(size: Int = 128) -> URL? {
        guard let iconHash else { return nil }
        return URL(string: "https://cdn.discordapp.com/icons/\(id)/\(iconHash).png?size=\(size)")
    }
}
