package com.pplaner.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;

/**
 * Spring Security configuration.
 *
 * Security measures:
 *  - CSRF: CookieCsrfTokenRepository (double-submit cookie pattern for SPA)
 *  - CORS: restricted to the configured frontend origin only (no wildcard)
 *  - Session: HttpOnly, Secure, SameSite=Lax cookies (set in application.properties)
 *  - HTTP Headers: CSP, X-Frame-Options DENY, nosniff, HSTS, Referrer-Policy
 *  - Authentication: OAuth2 login via Google only
 *  - Allow-list HTTP methods: only GET, POST, OPTIONS
 *
 * TODO(security): Add rate limiting (e.g., Bucket4j) on /auth and /api endpoints
 * TODO(security): Implement MFA if adding local user accounts in the future
 */
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Value("${pplaner.cors.allowed-origin}")
    private String allowedOrigin;

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            // ── CORS ─────────────────────────────────────────────────────────
            .cors(cors -> cors.configurationSource(corsConfigurationSource()))

            // ── CSRF ─────────────────────────────────────────────────────────
            // CookieCsrfTokenRepository: issues an XSRF-TOKEN cookie readable
            // by the SPA, which must echo it back as X-XSRF-TOKEN header.
            .csrf(csrf -> csrf
                .csrfTokenRepository(CookieCsrfTokenRepository.withHttpOnlyFalse())
                // Exclude GET requests (they are read-only, no state change)
                .ignoringRequestMatchers(HttpMethod.GET, "/**")
            )

            // ── Authorization ─────────────────────────────────────────────────
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/auth/callback", "/auth/login").permitAll()
                .requestMatchers("/actuator/health").permitAll()
                .anyRequest().authenticated()
            )

            // ── OAuth2 Login ──────────────────────────────────────────────────
            .oauth2Login(oauth2 -> oauth2
                .loginPage("/auth/login")
                .defaultSuccessUrl("/auth/success", true)
                .failureUrl("/auth/failure")
            )

            // ── Logout ────────────────────────────────────────────────────────
            .logout(logout -> logout
                .logoutUrl("/auth/logout")
                .invalidateHttpSession(true)
                .clearAuthentication(true)
                .deleteCookies("__Secure-pplaner-session", "JSESSIONID")
                .logoutSuccessUrl(allowedOrigin + "/")
            )

            // ── HTTP Security Headers ─────────────────────────────────────────
            .headers(headers -> headers
                .frameOptions(frame -> frame.deny())
                .contentTypeOptions(ct -> {})
                .httpStrictTransportSecurity(hsts -> hsts
                    .maxAgeInSeconds(63_072_000)
                    .includeSubDomains(true)
                    .preload(true)
                )
                .referrerPolicy(ref -> ref
                    .policy(ReferrerPolicyHeaderWriter.ReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN)
                )
                .contentSecurityPolicy(csp -> csp
                    .policyDirectives(
                        "default-src 'self'; " +
                        "script-src 'none'; " +
                        "object-src 'none'; " +
                        "base-uri 'self'; " +
                        "frame-ancestors 'none'"
                    )
                )
            );

        return http.build();
    }

    /**
     * CORS: only allow requests from the configured frontend origin.
     * No wildcard (*) origins. Credentials are allowed (for cookies).
     */
    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration config = new CorsConfiguration();

        // Strict allow-list: single origin, no wildcards
        config.setAllowedOrigins(List.of(allowedOrigin));
        config.setAllowedMethods(List.of("GET", "POST", "OPTIONS"));
        config.setAllowedHeaders(List.of("Content-Type", "X-XSRF-TOKEN", "Accept"));
        config.setExposedHeaders(List.of("X-XSRF-TOKEN"));
        config.setAllowCredentials(true); // Required for cookies
        config.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }
}
