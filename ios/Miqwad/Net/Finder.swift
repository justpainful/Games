import Foundation
import Network

/// خادم تحكّم وُجد على الشبكة.
struct FoundServer: Identifiable, Equatable, Sendable {
    let id: String
    let name: String
    /// عنوان جاهز للطلبات، مثل `http://192.168.1.4:4590`
    let base: String
}

/// البحث عن البوت على الشبكة المحلية.
///
/// ————————————————— لماذا لا يُكتب العنوان يدويًا —————————————————
///
/// الراوتر يوزّع العناوين بالـDHCP، فعنوان اليوم عنوان جهاز آخر بعد أسبوع.
/// والتطبيق القديم هرب من ذلك إلى عنوان Tailscale ثابت، وهو ما طُلب التخلّص
/// منه. وBonjour يحلّها من جذرها: الجهاز ينادي والتطبيق يسمع.
///
/// ————————————————— لماذا يُحلّ العنوان بوصلة —————————————————
///
/// `NWBrowser` يعطي `NWEndpoint.service` لا عنوانًا، و`URLSession` لا يفهمه.
/// وفتح `NWConnection` إليه ثم قراءة `currentPath.remoteEndpoint` هو الطريق
/// المدعوم لتحويله إلى IP ومنفذ. والوصلة تُلغى فور القراءة: غرضها الترجمة لا
/// نقل البيانات.
@MainActor
@Observable
final class Finder {
    private(set) var servers: [FoundServer] = []
    private(set) var searching = false

    private var browser: NWBrowser?
    private var resolving: [String: NWConnection] = [:]

    func start() {
        guard browser == nil else { return }
        servers = []
        searching = true

        let params = NWParameters()
        params.includePeerToPeer = false
        let found = NWBrowser(for: .bonjour(type: "_miqwad._tcp", domain: nil), using: params)

        found.browseResultsChangedHandler = { [weak self] results, _ in
            Task { @MainActor in self?.take(results) }
        }
        found.stateUpdateHandler = { [weak self] state in
            Task { @MainActor in
                // `.failed` غالبًا يعني رفض إذن الشبكة المحلية — الشاشة تقول
                // ذلك للمستخدم بدل أن تدور بلا نهاية
                if case .failed = state { self?.searching = false }
            }
        }

        browser = found
        found.start(queue: .main)
    }

    func stop() {
        browser?.cancel()
        browser = nil
        for connection in resolving.values { connection.cancel() }
        resolving = [:]
        searching = false
    }

    private func take(_ results: Set<NWBrowser.Result>) {
        let live = Set(results.compactMap { key(of: $0) })
        servers.removeAll { !live.contains($0.id) }

        for result in results {
            guard let name = key(of: result) else { continue }
            guard !servers.contains(where: { $0.id == name }), resolving[name] == nil else { continue }
            resolve(result.endpoint, named: name)
        }
    }

    private func key(of result: NWBrowser.Result) -> String? {
        if case let .service(name, _, _, _) = result.endpoint { return name }
        return nil
    }

    private func resolve(_ endpoint: NWEndpoint, named name: String) {
        let connection = NWConnection(to: endpoint, using: .tcp)
        resolving[name] = connection

        connection.stateUpdateHandler = { [weak self] state in
            switch state {
            case .ready:
                let path = connection.currentPath?.remoteEndpoint
                connection.cancel()
                Task { @MainActor in self?.landed(name: name, at: path) }
            case .failed, .cancelled:
                Task { @MainActor in self?.resolving[name] = nil }
            default:
                break
            }
        }
        connection.start(queue: .main)
    }

    private func landed(name: String, at endpoint: NWEndpoint?) {
        resolving[name] = nil
        guard case let .hostPort(host, port) = endpoint else { return }
        guard let address = literal(host) else { return }
        guard !servers.contains(where: { $0.id == name }) else { return }

        servers.append(FoundServer(id: name, name: name, base: "http://\(address):\(port.rawValue)"))
        searching = false
    }

    /// عنوان صالح داخل URL.
    ///
    /// IPv6 على الرابط المحلي يأتي بلاحقة واجهة مثل `fe80::1%en0`، و
    /// `URLSession` لا يقبلها. فالمفضّل IPv4، وIPv6 يُقبل بلا لاحقة فقط.
    private func literal(_ host: NWEndpoint.Host) -> String? {
        switch host {
        case .ipv4(let address):
            return "\(address)".split(separator: "%").first.map(String.init)
        case .ipv6(let address):
            let text = "\(address)"
            return text.contains("%") ? nil : "[\(text)]"
        case .name(let text, _):
            return text
        @unknown default:
            return nil
        }
    }
}
