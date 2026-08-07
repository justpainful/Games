import XCTest
@testable import Games

/// اختبارات الكتالوج والنماذج.
///
/// تضمن أيضًا أن هدف الاختبار لا يبقى بلا مصدر — مجلد فارغ لا يتتبّعه git،
/// وXcodeGen يرفض هدفًا بمجلد مصادر مفقود فيفشل البناء قبل أن يبدأ.
final class CatalogTests: XCTestCase {

    func testCatalogIsComplete() {
        XCTAssertEqual(Catalog.all.count, 27, "عدد الألعاب تغيّر — حدّث الكتالوج أو الاختبار")
        XCTAssertEqual(
            Catalog.all.count,
            Catalog.words.count + Catalog.duels.count + Catalog.groups.count,
            "لعبة خارج الأقسام الثلاثة لن تظهر في أي شاشة"
        )
    }

    func testGameIDsAreUnique() {
        let ids = Catalog.all.map(\.id)
        XCTAssertEqual(Set(ids).count, ids.count, "مفتاح لعبة مكرّر يكسر الربط مع الخادم")
    }

    func testPlayerBoundsAreSane() {
        for game in Catalog.all {
            XCTAssertGreaterThanOrEqual(game.minPlayers, 1, "\(game.id): حد أدنى غير منطقي")
            XCTAssertGreaterThanOrEqual(
                game.maxPlayers, game.minPlayers,
                "\(game.id): الحد الأقصى أقل من الأدنى"
            )
            XCTAssertFalse(game.title.isEmpty, "\(game.id): بلا عنوان")
            XCTAssertFalse(game.howTo.isEmpty, "\(game.id): بلا شرح")
        }
    }

    /// اللعب المنفرد يحتاج خصمًا آليًا، وهو لا يصلح للألعاب الجماعية.
    func testSoloGamesAllowOnePlayer() {
        for game in Catalog.soloGames {
            XCTAssertEqual(game.minPlayers, 1, "\(game.id): معلَّمة soloable لكن تحتاج أكثر من لاعب")
        }
        XCTAssertFalse(Catalog.soloGames.isEmpty)
    }

    // ————— النماذج —————

    func testShownNamePrefersDisplayName() {
        let withDisplay = Account(id: "1", username: "abdul_123", displayName: "عبدالرحمن", avatarHash: nil)
        XCTAssertEqual(withDisplay.shownName, "عبدالرحمن")

        let noDisplay = Account(id: "1", username: "abdul_123", displayName: nil, avatarHash: nil)
        XCTAssertEqual(noDisplay.shownName, "abdul_123")

        // اسم عرض فارغ أو مسافات لا يُعرض — وإلا ظهر سطر خالٍ مكان الاسم
        let blank = Account(id: "1", username: "abdul_123", displayName: "   ", avatarHash: nil)
        XCTAssertEqual(blank.shownName, "abdul_123")
    }

    func testAvatarURLFallsBackToDefault() {
        let noAvatar = Account(id: "308994132968210433", username: "u", displayName: nil, avatarHash: nil)
        let url = noAvatar.avatarURL()
        XCTAssertNotNil(url, "من لا صورة له يجب أن يحصل على أفتار افتراضي لا nil")
        XCTAssertTrue(url!.absoluteString.contains("embed/avatars"))

        let withAvatar = Account(id: "1", username: "u", displayName: nil, avatarHash: "abc123")
        XCTAssertTrue(withAvatar.avatarURL()!.absoluteString.contains("abc123.png"))

        // الأفتار المتحرّك يبدأ بـ a_ ويجب أن يُطلب كـ gif
        let animated = Account(id: "1", username: "u", displayName: nil, avatarHash: "a_xyz")
        XCTAssertTrue(animated.avatarURL()!.absoluteString.contains(".gif"))
    }

    func testPointsTotal() {
        let p = Points(roulette: 3, team: 5, solo: 7, gamesPlayed: 10, wins: 4)
        XCTAssertEqual(p.total, 15)
        XCTAssertEqual(p.winRate, 0.4, accuracy: 0.0001)
        // القسمة على صفر لا تُنتج NaN في الواجهة
        XCTAssertEqual(Points.empty.winRate, 0)
    }

    func testBidiIsolationWrapsName() {
        let isolated = ".zja6".bidiIsolated
        XCTAssertTrue(isolated.hasPrefix("\u{2068}"), "بلا FSI تقفز النقطة لطرف المقطع")
        XCTAssertTrue(isolated.hasSuffix("\u{2069}"))
        XCTAssertTrue(isolated.contains(".zja6"))
    }
}
