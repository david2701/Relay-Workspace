import Foundation
import RelayKit

#if DEBUG
/// Penpot Atención sample fixtures for DEBUG screenshots / previews only.
/// Never compiled into Release. Source: RelayKit test fixtures (demo seed).
enum PenpotSampleData {
    static let uiScreenshotsLaunchArgument = "-RelayUIScreenshots"
    static let screenshotScreenLaunchArgument = "-RelayScreenshotScreen"

    static var shouldLoadForUIScreenshots: Bool {
        if ProcessInfo.processInfo.arguments.contains(uiScreenshotsLaunchArgument) {
            return true
        }
        let env = ProcessInfo.processInfo.environment["RELAY_UI_SCREENSHOTS"] ?? ""
        return env == "1" || env.lowercased() == "true"
    }

    /// Optional screen hint for CI capture: `list` (default) or `detail`.
    static var screenshotScreen: String {
        let args = ProcessInfo.processInfo.arguments
        if let index = args.firstIndex(of: screenshotScreenLaunchArgument),
           args.index(after: index) < args.count {
            return args[args.index(after: index)].lowercased()
        }
        return (ProcessInfo.processInfo.environment["RELAY_SCREENSHOT_SCREEN"] ?? "list").lowercased()
    }

    static var inbox: InboxQueryResult {
        decode(InboxQueryResult.self, from: inboxJSON)
    }

    static var agents: [Agent] {
        decode(AgentsEnvelope.self, from: agentsJSON).agents
    }

    private static func decode<T: Decodable>(_ type: T.Type, from string: String) -> T {
        let data = Data(string.utf8)
        do {
            return try JSONDecoder().decode(type, from: data)
        } catch {
            preconditionFailure("DEBUG Penpot sample decode failed: \(error)")
        }
    }

    // Existing RelayKit fixture `inbox_attention.json` (Penpot Atención seed).
    private static let inboxJSON = """
    {
      "view": "attention",
      "items": [
        {
          "id": "itm_32pxnq1110",
          "title": "Elegir el titular del post de lanzamiento",
          "goal": "Post publicado con un titular aprobado",
          "status": "needs_you",
          "assignee_type": "agent",
          "assignee_id": "agent-code",
          "due_at": "2026-10-09T21:40:42.169Z",
          "reminder_at": "2026-10-09T07:40:42.169Z",
          "reminder_intent": "Revisar el borrador antes de publicar",
          "priority": "none",
          "blocked_reason": null,
          "needs_you_reason": "¿Publico la versión A («Relay») o la B («Relevo»)? El post sale mañana a las 09:00.",
          "source": "mcp",
          "created_at": "2026-10-09T03:40:42.169Z",
          "updated_at": "2026-10-09T00:40:42.176Z",
          "started_at": null,
          "completed_at": null,
          "completed_by_type": null,
          "completed_by_id": null,
          "last_actor_type": "agent",
          "last_actor_id": "agent-code",
          "list_id": null
        },
        {
          "id": "itm_cozkg4zncr",
          "title": "Migrar notas archivadas al almacén",
          "goal": "Cada nota bajo /archive indexada en Relay",
          "status": "blocked",
          "assignee_type": "agent",
          "assignee_id": "agent-research",
          "due_at": null,
          "reminder_at": null,
          "reminder_intent": null,
          "priority": "medium",
          "blocked_reason": "falta acceso de lectura a la carpeta /archive",
          "needs_you_reason": null,
          "source": "ui",
          "created_at": "2026-10-09T03:40:42.176Z",
          "updated_at": "2026-10-09T03:40:42.181Z",
          "started_at": null,
          "completed_at": null,
          "completed_by_type": null,
          "completed_by_id": null,
          "last_actor_type": "agent",
          "last_actor_id": "agent-research",
          "list_id": null
        },
        {
          "id": "itm_dgkif68fct",
          "title": "Preparar la grabación de la demo del producto",
          "goal": "Demo de tres minutos del bucle chat → Relay → hecho",
          "status": "in_progress",
          "assignee_type": "agent",
          "assignee_id": "agent-code",
          "due_at": "2026-10-09T06:40:42.155Z",
          "reminder_at": "2026-10-09T04:40:42.155Z",
          "reminder_intent": "Revisar el borrador antes de grabar",
          "priority": "high",
          "blocked_reason": null,
          "needs_you_reason": null,
          "source": "ui",
          "created_at": "2026-10-09T03:40:42.155Z",
          "updated_at": "2026-10-09T03:40:42.167Z",
          "started_at": "2026-10-09T03:40:42.167Z",
          "completed_at": null,
          "completed_by_type": null,
          "completed_by_id": null,
          "last_actor_type": "agent",
          "last_actor_id": "agent-code",
          "list_id": null
        },
        {
          "id": "itm_l8w965icft",
          "title": "Revisar el acuerdo de hosting",
          "goal": null,
          "status": "assigned",
          "assignee_type": "user",
          "assignee_id": "user",
          "due_at": null,
          "reminder_at": "2026-10-09T21:40:42.183Z",
          "reminder_intent": "Llamar antes de firmar",
          "priority": "none",
          "blocked_reason": null,
          "needs_you_reason": null,
          "source": "ui",
          "created_at": "2026-10-09T03:40:42.183Z",
          "updated_at": "2026-10-09T03:40:42.185Z",
          "started_at": null,
          "completed_at": null,
          "completed_by_type": null,
          "completed_by_id": null,
          "last_actor_type": "user",
          "last_actor_id": "user",
          "list_id": null
        }
      ],
      "counters": { "needs_you": 1 },
      "total_count": 4,
      "next_cursor": null,
      "has_more": false,
      "sync_cursor": "2026-10-09T03:40:45.289Z",
      "server_time": "2026-10-09T03:40:45.289Z",
      "section_counts": { "needs_you": 1, "blocked": 1, "today": 2 },
      "sections": [
        {
          "key": "needs_you",
          "items": [
            {
              "id": "itm_32pxnq1110",
              "title": "Elegir el titular del post de lanzamiento",
              "goal": "Post publicado con un titular aprobado",
              "status": "needs_you",
              "assignee_type": "agent",
              "assignee_id": "agent-code",
              "due_at": "2026-10-09T21:40:42.169Z",
              "reminder_at": "2026-10-09T07:40:42.169Z",
              "reminder_intent": "Revisar el borrador antes de publicar",
              "priority": "none",
              "blocked_reason": null,
              "needs_you_reason": "¿Publico la versión A («Relay») o la B («Relevo»)? El post sale mañana a las 09:00.",
              "source": "mcp",
              "created_at": "2026-10-09T03:40:42.169Z",
              "updated_at": "2026-10-09T00:40:42.176Z",
              "started_at": null,
              "completed_at": null,
              "completed_by_type": null,
              "completed_by_id": null,
              "last_actor_type": "agent",
              "last_actor_id": "agent-code",
              "list_id": null
            }
          ]
        },
        {
          "key": "blocked",
          "items": [
            {
              "id": "itm_cozkg4zncr",
              "title": "Migrar notas archivadas al almacén",
              "goal": "Cada nota bajo /archive indexada en Relay",
              "status": "blocked",
              "assignee_type": "agent",
              "assignee_id": "agent-research",
              "due_at": null,
              "reminder_at": null,
              "reminder_intent": null,
              "priority": "medium",
              "blocked_reason": "falta acceso de lectura a la carpeta /archive",
              "needs_you_reason": null,
              "source": "ui",
              "created_at": "2026-10-09T03:40:42.176Z",
              "updated_at": "2026-10-09T03:40:42.181Z",
              "started_at": null,
              "completed_at": null,
              "completed_by_type": null,
              "completed_by_id": null,
              "last_actor_type": "agent",
              "last_actor_id": "agent-research",
              "list_id": null
            }
          ]
        },
        {
          "key": "today",
          "items": [
            {
              "id": "itm_dgkif68fct",
              "title": "Preparar la grabación de la demo del producto",
              "goal": "Demo de tres minutos del bucle chat → Relay → hecho",
              "status": "in_progress",
              "assignee_type": "agent",
              "assignee_id": "agent-code",
              "due_at": "2026-10-09T06:40:42.155Z",
              "reminder_at": "2026-10-09T04:40:42.155Z",
              "reminder_intent": "Revisar el borrador antes de grabar",
              "priority": "high",
              "blocked_reason": null,
              "needs_you_reason": null,
              "source": "ui",
              "created_at": "2026-10-09T03:40:42.155Z",
              "updated_at": "2026-10-09T03:40:42.167Z",
              "started_at": "2026-10-09T03:40:42.167Z",
              "completed_at": null,
              "completed_by_type": null,
              "completed_by_id": null,
              "last_actor_type": "agent",
              "last_actor_id": "agent-code",
              "list_id": null
            },
            {
              "id": "itm_l8w965icft",
              "title": "Revisar el acuerdo de hosting",
              "goal": null,
              "status": "assigned",
              "assignee_type": "user",
              "assignee_id": "user",
              "due_at": null,
              "reminder_at": "2026-10-09T21:40:42.183Z",
              "reminder_intent": "Llamar antes de firmar",
              "priority": "none",
              "blocked_reason": null,
              "needs_you_reason": null,
              "source": "ui",
              "created_at": "2026-10-09T03:40:42.183Z",
              "updated_at": "2026-10-09T03:40:42.185Z",
              "started_at": null,
              "completed_at": null,
              "completed_by_type": null,
              "completed_by_id": null,
              "last_actor_type": "user",
              "last_actor_id": "user",
              "list_id": null
            }
          ]
        }
      ]
    }
    """

    // Existing RelayKit fixture `agents.json`.
    private static let agentsJSON = """
    {
      "agents": [
        { "id": "agent-code", "display_name": "Agente de código", "monogram": "CO" },
        { "id": "agent-data", "display_name": "Agente de datos", "monogram": "DA" },
        { "id": "agent-research", "display_name": "Agente de investigación", "monogram": "IN" },
        { "id": "agent-writing", "display_name": "Agente de redacción", "monogram": "RD" }
      ]
    }
    """
}
#endif
