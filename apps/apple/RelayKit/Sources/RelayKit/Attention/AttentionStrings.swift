import Foundation

/// Spanish Attention copy aligned with web `es.json` and native mockups.
/// Kept as plain constants so Linux unit tests can assert without localization bundles.
public enum AttentionStrings {
    public static let title = "Atención"
    public static let sectionNeedsYou = "Te necesita"
    public static let sectionBlocked = "Atascado"
    public static let sectionToday = "Para hoy"
    public static let syncUpToDatePrefix = "Al día"
    public static let syncOffline = "Sin conexión"
    public static let offlineBannerTitle = "Sin conexión con la API local"
    public static let offlineBannerBody =
        "Ves lo último que llegó. Lo que respondas se envía al volver."
    public static let offlineRetry = "Reintentar"
    public static let emptyTitle = "Nada te necesita ahora"
    public static let emptyBodyMac =
        "Tu equipo sigue. La barra de menús te avisa cuando alguno te pida algo."
    public static let emptyBodyPhone =
        "Tu equipo sigue. Te avisamos cuando alguno te pida algo."
    public static let emptySeeTeam = "Ver Equipo"
    public static let emptyNewItem = "Nuevo ítem"
    public static let detailPlaceholder = "Selecciona un ítem para ver su contexto"
    public static let errorTitle = "No se pudo cargar Atención"
    public static let retry = "Reintentar"
    public static let loading = "Cargando Atención"
    public static let capturePlaceholder = "Escribe un ítem y pulsa Intro"
    public static let capturePlaceholderPhone = "Escribe un ítem"
    public static let decisionPlaceholder =
        "Tu decisión o instrucción. Se guarda como nota de decisión para el agente"
    public static let decisionPlaceholderShort = "Tu decisión o instrucción"
    public static let ctaDoMyself = "Lo hago yo"
    public static let ctaAssign = "Asignar"
    public static let ctaDelegate = "Delegar"
    public static let ctaLinkNote = "Vincular nota"
    public static let ctaNote = "Nota"
    public static let handoffCaps = "TRASPASO"
    public static let goalCaps = "OBJETIVO"
    public static let reminderCaps = "RECORDATORIO"
    public static let contextCaps = "CONTEXTO"
    public static let decisionCaps = "DECISIÓN"
    public static let whenDue = "Para cuándo"
    public static let remindMe = "Avisarme"
    public static let navTeam = "Equipo"
    public static let navNotes = "Notas"
    public static let search = "Buscar"
    public static let filter = "Filtrar"
    public static let a11yNeedsYouRule = "Te necesita"
    public static let a11ySelected = "Seleccionado"
    public static let a11yNeedsYouCount = "ítems te necesitan"
    public static let keyboardMove = "mover"
    public static let keyboardOpen = "abrir"
    public static let keyboardComplete = "completar"
    public static let keyboardAssign = "asignar"
    public static let pendingSyncBody =
        "Respuesta guardada en el dispositivo. Relay la enviará cuando vuelva la conexión."
    public static let contextEmpty =
        "Sin notas. Vincula una nota para que el agente no tenga que preguntar"
    public static let goalMissing = "Sin objetivo — el agente no sabrá cuándo ha terminado"
    public static let unassigned = "Sin asignar"
    public static let you = "Tú"
    public static let system = "Sistema"

    public static func sectionTitle(for key: AttentionSectionKey) -> String {
        switch key {
        case .needsYou: return sectionNeedsYou
        case .blocked: return sectionBlocked
        case .today: return sectionToday
        }
    }

    public static func statusLabel(_ status: Status) -> String {
        switch status {
        case .inbox: return "Por clasificar"
        case .assigned: return "Asignado"
        case .inProgress: return "En curso"
        case .blocked: return sectionBlocked
        case .needsYou: return sectionNeedsYou
        case .done: return "Hecho"
        case .cancelled: return "Cancelado"
        }
    }

    public static func returnToAgent(_ name: String) -> String {
        "Devolver a \(name)"
    }

    public static func needsYouAsk(agent: String, relative: String) -> String {
        "\(agent) necesita tu decisión · \(relative)"
    }

    public static func handoffPassed(agent: String) -> String {
        "\(agent) te lo pasó"
    }

    public static func blockedMeta(_ reason: String) -> String {
        "Atascado: \(reason)"
    }

    public static func emptyBody(activeItemCount: Int, platform: AttentionPlatform) -> String {
        if activeItemCount <= 0 {
            return platform == .mac ? emptyBodyMac : emptyBodyPhone
        }
        let noun = activeItemCount == 1 ? "1 ítem" : "\(activeItemCount) ítems"
        switch platform {
        case .mac:
            return "Tu equipo sigue con \(noun). La barra de menús te avisa cuando alguno te pida algo."
        case .phone:
            return "Tu equipo sigue con \(noun). Te avisamos cuando alguno te pida algo."
        }
    }
}

public enum AttentionPlatform: String, Sendable, Equatable {
    case mac
    case phone
}
