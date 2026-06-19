package com.pplaner.controller;

import com.pplaner.service.CalendarSyncService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.client.OAuth2AuthorizedClient;
import org.springframework.security.oauth2.client.annotation.RegisteredOAuth2AuthorizedClient;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.web.bind.annotation.*;

import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;

/**
 * Calendar sync controller.
 *
 * Security:
 *  - All endpoints require authentication (enforced by SecurityConfig)
 *  - Access tokens are retrieved from Spring's OAuth2 client registry (server-side)
 *  - Request body is validated before processing
 *  - Error details are not exposed to the client
 *  - Max 100 events per sync request to prevent abuse
 *
 * TODO(security): Add rate limiting on POST /api/sync/push
 */
@RestController
@RequestMapping("/api/sync")
public class CalendarController {

    private final CalendarSyncService syncService;

    public CalendarController(CalendarSyncService syncService) {
        this.syncService = syncService;
    }

    /**
     * POST /api/sync/push
     * Pushes local events to Google Calendar.
     *
     * @param events  List of planner events (max 100, validated server-side)
     * @param client  The OAuth2 client with the access token (never exposed to client)
     */
    @PostMapping("/push")
    public ResponseEntity<?> pushEvents(
            @RequestBody @Valid List<Map<String, Object>> events,
            @RegisteredOAuth2AuthorizedClient("google") OAuth2AuthorizedClient client,
            @AuthenticationPrincipal OAuth2User principal
    ) {
        if (events == null || events.isEmpty()) {
            return ResponseEntity.ok(Map.of("pushed", 0, "updatedEvents", List.of()));
        }

        // Enforce max 100 events per request
        List<Map<String, Object>> limited = events.size() > 100 ? events.subList(0, 100) : events;

        try {
            var result = syncService.pushEvents(limited, client.getAccessToken().getTokenValue());
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            // Log server-side but don't expose details to client
            System.err.println("[PPlaner] Push sync error for user");
            return ResponseEntity.status(502).body(Map.of("error", "Failed to sync events. Please try again."));
        }
    }

    /**
     * GET /api/sync/pull
     * Pulls events from Google Calendar for the next 90 days.
     */
    @GetMapping("/pull")
    public ResponseEntity<?> pullEvents(
            @RegisteredOAuth2AuthorizedClient("google") OAuth2AuthorizedClient client
    ) {
        try {
            var result = syncService.pullEvents(client.getAccessToken().getTokenValue());
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            System.err.println("[PPlaner] Pull sync error");
            return ResponseEntity.status(502).body(Map.of("error", "Failed to fetch Google Calendar events."));
        }
    }
}
