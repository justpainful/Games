// ⚠️ ملف مولّد — لا تحرّره.
// المصدر: src/design/tokens.ts  ·  أعد التوليد: npm run gen:swift

import SwiftUI

public enum Ink {
    public static let paper = Color(red: 0.9373, green: 0.8902, blue: 0.7961)
    public static let paperTint = Color(red: 0.9020, green: 0.8471, blue: 0.7373)
    public static let surface = Color(red: 0.9843, green: 0.9608, blue: 0.9098)
    public static let ink = Color(red: 0.1020, green: 0.0824, blue: 0.0706)
    public static let red = Color(red: 0.8784, green: 0.2275, blue: 0.1843)
    public static let redDeep = Color(red: 0.6588, green: 0.1373, blue: 0.1020)
    public static let yellow = Color(red: 0.9843, green: 0.7490, blue: 0.1176)
    public static let cream = Color(red: 1.0000, green: 0.9922, blue: 0.9686)
}

public enum Metric {
    public static let sizeDisplay: CGFloat = 82
    public static let sizeTitle: CGFloat = 38
    public static let sizeBody: CGFloat = 26
    public static let sizeLabel: CGFloat = 25
    public static let sizeMeta: CGFloat = 21
    public static let strokeThin: CGFloat = 3
    public static let strokeBase: CGFloat = 5
    public static let strokeThick: CGFloat = 8
    public static let liftSm: CGFloat = 7
    public static let liftBase: CGFloat = 11
    public static let liftLg: CGFloat = 15
    public static let radiusSm: CGFloat = 14
    public static let radiusBase: CGFloat = 24
    public static let radiusLg: CGFloat = 34
    public static let radiusPill: CGFloat = 999
    public static let spaceXs: CGFloat = 10
    public static let spaceSm: CGFloat = 18
    public static let spaceBase: CGFloat = 28
    public static let spaceLg: CGFloat = 44
    public static let spaceXl: CGFloat = 64
    public static let leadingTight: CGFloat = 1.7
    public static let leadingBase: CGFloat = 1.8
}

/// أوزان الخطوط كما سُجّلت أسماؤها في الحزمة (PostScript names).
public enum Face {
    public static let display = "BalooBhaijaan2-ExtraBold"
    public static let displaySoft = "BalooBhaijaan2-Bold"
    public static let body = "Cairo-Regular"
    public static let bodyBold = "Cairo-Bold"
}

/// أوزان رقمية للرجوع إليها عند الحاجة: regular=400 · medium=500 · bold=700 · black=800
