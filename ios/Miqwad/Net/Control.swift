import Foundation

// ————————————————————— ما يرسله الخادم —————————————————————
//
// الأشكال هنا مقيّدة بـ `src/panel/status.ts` و`src/panel/mount.ts` حرفيًا.
// أي إعادة تسمية حقل هناك تكسر الفكّ هنا بصمت وتنتهي برسالة «رد غير متوقّع»
// أمام المستخدم. والمفاتيح camelCase على الطرفين بلا تحويل، فلا استراتيجية
// أسماء تُخمّن ما لم يُكتب.

struct Hello: Decodable, Sendable {
    let service: String
    let bot: String?
    let online: Bool
    let guilds: Int
    let discordLogin: Bool
}

struct Who: Decodable, Sendable, Equatable {
    let id: String
    let via: String
    let name: String
}

struct PairReply: Decodable, Sendable {
    let token: String
    let user: Who
}

struct BotFacts: Decodable, Sendable {
    let online: Bool
    let tag: String?
    let id: String?
    let avatar: String?
    let pingMs: Int?
    let upSeconds: Int?
    let guilds: Int
    let members: Int
}

struct GameFacts: Decodable, Sendable {
    let count: Int
    let running: Int
}

struct DbFacts: Decodable, Sendable {
    let ok: Bool
    let ms: Int?
    let error: String?
}

struct HostFacts: Decodable, Sendable {
    let node: String
    let platform: String
    let rssMb: Int
    let upSeconds: Int
    let pid: Int
}

struct LiveSession: Decodable, Sendable, Identifiable {
    let game: String
    let guildId: String
    let guildName: String?
    let channelId: String
    let hostId: String
    let startedAt: Double
    let attempts: Int

    var id: String { channelId }
}

struct Status: Decodable, Sendable {
    let bot: BotFacts
    let games: GameFacts
    let db: DbFacts
    let host: HostFacts
    let live: [LiveSession]
}

// ————————————————————— العميل —————————————————————

/// عميل التحكّم.
///
/// عنوان الخادم ليس ثابتًا في الحزمة كما في تطبيق الألعاب: هو ما وجده
/// `Finder` على الشبكة أو ما أدخله المستخدم، ويتبدّل بين تشغيل وآخر. ولذلك
/// يُمرَّر مع كل طلب بدل أن يُقرأ من `Info.plist`.
struct Control: Sendable {
    let base: String
    var token: String?

    enum Failure: Error, LocalizedError {
        case unreachable
        case unauthorized
        case server(Int, String)
        case malformed(String)

        var errorDescription: String? {
            switch self {
            case .unreachable: "ما وصلت للجهاز. تأكّد أن البوت شغّال وأنك على نفس الواي فاي."
            case .unauthorized: "انتهت الجلسة. أعد الاقتران."
            case .server(let code, let why): why.isEmpty ? "خطأ من الخادم (\(code))" : why
            case .malformed(let what): "رد غير متوقّع: \(what)"
            }
        }
    }

    func get<T: Decodable>(_ path: String) async throws -> T {
        try await send(path, method: "GET", body: nil)
    }

    func post<T: Decodable>(_ path: String, _ body: [String: String]) async throws -> T {
        try await send(path, method: "POST", body: try JSONEncoder().encode(body))
    }

    private func send<T: Decodable>(_ path: String, method: String, body: Data?) async throws -> T {
        guard let url = URL(string: base + path) else { throw Failure.malformed(path) }

        var request = URLRequest(url: url)
        request.httpMethod = method
        // ثوانٍ قليلة عمدًا: الجهاز على نفس الشبكة يردّ في مللي ثانية، ومهلة
        // طويلة تعني شاشة تدور نصف دقيقة قبل أن تقول «ما وصلت»
        request.timeoutInterval = 8
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        request.httpBody = body

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await URLSession.shared.data(for: request)
        } catch {
            throw Failure.unreachable
        }

        guard let http = response as? HTTPURLResponse else { throw Failure.malformed("بلا حالة HTTP") }
        if http.statusCode == 401 { throw Failure.unauthorized }
        guard (200..<300).contains(http.statusCode) else {
            let why = (try? JSONDecoder().decode([String: String].self, from: data))?["error"] ?? ""
            throw Failure.server(http.statusCode, why)
        }

        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            throw Failure.malformed(String(describing: T.self))
        }
    }
}
