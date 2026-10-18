"""Home-kit colours per team, used for match tokens and avatar collars.

kit = main shirt colour, trim = collar/secondary colour.
"""

KITS = {
    "ALG": ("#0B7A3E", "#FFFFFF"), "ARG": ("#75AADB", "#FFFFFF"), "AUS": ("#FFCD00", "#00843D"),
    "AUT": ("#ED2939", "#FFFFFF"), "BEL": ("#C8102E", "#FDDA24"), "BIH": ("#1D3C9A", "#FECB00"),
    "BRA": ("#FFDF00", "#009C3B"), "CAN": ("#D80621", "#FFFFFF"), "CIV": ("#FF8200", "#009E60"),
    "COD": ("#007FFF", "#CE1021"), "COL": ("#FCD116", "#003893"), "CPV": ("#003893", "#CF2027"),
    "CRO": ("#D52B1E", "#FFFFFF"), "CUW": ("#002B7F", "#F9E814"), "CZE": ("#D7141A", "#11457E"),
    "ECU": ("#FFD100", "#0072CE"), "EGY": ("#CE1126", "#1A1A1A"), "ENG": ("#FFFFFF", "#1D2C5E"),
    "ESP": ("#C60B1E", "#FFC400"), "FRA": ("#1E2A4A", "#E1000F"), "GER": ("#FFFFFF", "#1A1A1A"),
    "GHA": ("#FFFFFF", "#FCD116"), "HAI": ("#00209F", "#D21034"), "IRN": ("#FFFFFF", "#DA0000"),
    "IRQ": ("#007A3D", "#FFFFFF"), "JOR": ("#CE1126", "#FFFFFF"), "JPN": ("#0A3A8C", "#FFFFFF"),
    "KOR": ("#C60C30", "#0047A0"), "KSA": ("#006C35", "#FFFFFF"), "MAR": ("#C1272D", "#006233"),
    "MEX": ("#006847", "#CE1126"), "NED": ("#F36C21", "#1E2A4A"), "NOR": ("#BA0C2F", "#00205B"),
    "NZL": ("#FFFFFF", "#1A1A1A"), "PAN": ("#DA121A", "#072357"), "PAR": ("#D52B1E", "#FFFFFF"),
    "POR": ("#A6192E", "#006600"), "QAT": ("#8A1538", "#FFFFFF"), "RSA": ("#FFB81C", "#007749"),
    "SCO": ("#0B2A5B", "#FFFFFF"), "SEN": ("#FFFFFF", "#00853F"), "SUI": ("#D52B1E", "#FFFFFF"),
    "SWE": ("#FECC00", "#006AA7"), "TUN": ("#E70013", "#FFFFFF"), "TUR": ("#E30A17", "#FFFFFF"),
    "URU": ("#5CBFEB", "#1A1A1A"), "USA": ("#FFFFFF", "#0A3161"), "UZB": ("#0099B5", "#FFFFFF"),
}


def _mix(hex_a, hex_b, t):
    a = [int(hex_a[i:i + 2], 16) for i in (1, 3, 5)]
    b = [int(hex_b[i:i + 2], 16) for i in (1, 3, 5)]
    return "#" + "".join(f"{round(x + (y - x) * t):02X}" for x, y in zip(a, b))


def avatar_background(team_id):
    """A soft tint of the team colour; white kits tint from their trim instead."""
    kit, trim = KITS[team_id]
    base = trim if kit.upper() == "#FFFFFF" else kit
    return _mix(base, "#FBF7EE", 0.78)
