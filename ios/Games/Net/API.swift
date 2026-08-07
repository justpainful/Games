import Foundation

/// عنوان الخادم.
///
/// يُقرأ من Info.plist لا من ثابت في الكود، فيمكن تبديل بيئة التطوير والإنتاج
/// بلا تعديل مصدر ولا إعادة بناء يدوي.
public enum Backend {
    public static var baseURL: URL {
        let raw = Bundle.main.object(forInfoDictionaryKey: "APIBaseURL") as? String
        return URL(string: raw ?? "http://localhost:8080")!
    }
}

/// عميل HTTP بسيط يحمل رمز الجلسة تلقائيًا.
public actor API {
    public static let shared = API()

    public enum Failure: Error, LocalizedError {
        case unauthorized
        case server(Int, String)
        case decoding(String)
        case offline

        public var errorDescription: String? {
            switch self {
            case .unauthorized: "انتهت جلستك. سجّل الدخول مرة أخرى."
            case .server(let code, let msg): "خطأ من الخادم (\(code)): \(msg)"
            case .decoding(let what): "رد غير متوقع من الخادم: \(what)"
            case .offline: "لا يوجد اتصال بالإنترنت."
            }
        }
    }

    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        return d
    }()

    private let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.keyEncodingStrategy = .convertToSnakeCase
        return e
    }()

    public func get<T: Decodable>(_ path: String) async throws -> T {
        try await send(path, method: "GET", body: Optional<Int>.none)
    }

    public func post<T: Decodable, B: Encodable>(_ path: String, _ body: B) async throws -> T {
        try await send(path, method: "POST", body: body)
    }

    private func send<T: Decodable, B: Encodable>(
        _ path: String, method: String, body: B?
    ) async throws -> T {
        // `appendingPathComponent` يرمّز `?` إلى `%3F`، فيصل المسار
        // `/leaders/1?wallet=solo` إلى الخادم كمسار واحد بلا استعلام والفلترة
        // تُتجاهل بصمت. البناء النصّي ثم `URL(string:)` يحفظ الاستعلام.
        let base = Backend.baseURL.absoluteString.hasSuffix("/")
            ? String(Backend.baseURL.absoluteString.dropLast())
            : Backend.baseURL.absoluteString
        let full = path.hasPrefix("/") ? base + path : base + "/" + path
        guard let url = URL(string: full) else {
            throw Failure.decoding("مسار غير صالح: \(path)")
        }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = 20
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let token = Session.shared.token {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let body { request.httpBody = try encoder.encode(body) }

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await URLSession.shared.data(for: request)
        } catch {
            throw Failure.offline
        }

        guard let http = response as? HTTPURLResponse else {
            throw Failure.decoding("رد بلا حالة HTTP")
        }
        if http.statusCode == 401 { throw Failure.unauthorized }
        guard (200..<300).contains(http.statusCode) else {
            throw Failure.server(http.statusCode, String(data: data, encoding: .utf8) ?? "")
        }

        // مسار خاص لغياب المحتوى: 204 لا يحمل جسمًا يُفكّ
        if T.self == Empty.self, let empty = Empty() as? T { return empty }

        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw Failure.decoding(String(describing: T.self))
        }
    }
}

public struct Empty: Codable, Sendable { public init() {} }
