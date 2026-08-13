import Foundation

/// تطبيع ما يكتبه المستخدم في حقل العنوان.
///
/// من يكتب عنوان جهازه يكتبه كما رآه: `192.168.1.4` أو مع المنفذ أو منسوخًا
/// من الطرفيّة بـ `http://` وشرطة في آخره. ورفض أيّ من هذه بحجّة الصيغة يجعل
/// الباب الاحتياطي أصعب من المشكلة التي فُتح لأجلها.
enum Address {
    static let defaultPort = 4590

    static func normalize(_ typed: String) -> String? {
        var text = typed.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return nil }

        for scheme in ["http://", "https://"] where text.lowercased().hasPrefix(scheme) {
            text = String(text.dropFirst(scheme.count))
        }
        if let slash = text.firstIndex(of: "/") { text = String(text[text.startIndex..<slash]) }
        guard !text.isEmpty else { return nil }

        // IPv6 بين قوسين معقوفين: `[fe80::1]:4590` — الفاصلة الأخيرة وحدها منفذ
        let hasPort: Bool
        if text.hasPrefix("[") {
            hasPort = text.range(of: "]:") != nil
        } else {
            hasPort = text.contains(":")
        }

        return "http://" + (hasPort ? text : "\(text):\(defaultPort)")
    }
}
