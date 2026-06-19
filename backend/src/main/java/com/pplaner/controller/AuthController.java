package com.pplaner.controller;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.web.bind.annotation.*;

import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Map;

/**
 * Auth controller — handles OAuth2 flow outcomes and session info.
 *
 * The actual OAuth2 Authorization Code flow is handled by Spring Security's
 * built-in OAuth2 login support (configured in SecurityConfig).
 *
 * Security:
 *  - /auth/me returns ONLY public profile data (name, email, picture) — never tokens
 *  - /auth/success redirects to the frontend after login (no token in URL)
 *  - Tokens are managed entirely by Spring Security and stored server-side
 *  - No PII logged in any endpoint
 */
@RestController
@RequestMapping("/auth")
public class AuthController {

    @Value("${pplaner.cors.allowed-origin}")
    private String frontendOrigin;

    /**
     * GET /auth/me
     * Returns the authenticated user's public profile.
     * Tokens are NEVER included in the response.
     */
    @GetMapping("/me")
    public Map<String, String> getCurrentUser(@AuthenticationPrincipal OAuth2User principal) {
        if (principal == null) {
            return Map.of("error", "Not authenticated");
        }

        // Return only public profile info — no tokens, no internal IDs
        return Map.of(
            "name",    String.valueOf(principal.getAttribute("name")),
            "email",   String.valueOf(principal.getAttribute("email")),
            "picture", String.valueOf(principal.getAttribute("picture"))
        );
    }

    /**
     * GET /auth/success
     * Called by Spring Security after successful OAuth2 login.
     * Redirects to frontend (token stays on server).
     */
    @GetMapping("/success")
    public void loginSuccess(HttpServletResponse response) throws IOException {
        response.sendRedirect(frontendOrigin + "/");
    }

    /**
     * GET /auth/failure
     * Called by Spring Security on OAuth2 login failure.
     */
    @GetMapping("/failure")
    public void loginFailure(HttpServletResponse response) throws IOException {
        response.sendRedirect(frontendOrigin + "/?error=oauth_denied");
    }
}
