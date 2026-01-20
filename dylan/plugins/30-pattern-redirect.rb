# frozen_string_literal: true

# Pattern Redirect Plugin
# Ersetzt YOURLS für dynamische Pattern-basierte Redirects
#
# Patterns:
#   /n/SUCHWORT → Apple Shortcuts (Notes-Suche)
#   /XXXXXXXX (8 Zeichen) → DevonThink-Suche

class NotesRedirectPlugin < Dylan::Plugin
  pattern(%r{^/n/(.+)$})

  def call(host, path, request)
    match = path.match(%r{^/n/(.+)$})
    search_term = match[1]

    Dylan::Response.redirect("shortcuts://run-shortcut?name=hook_notes&input=#{search_term}")
  end
end

class DevonThinkPlugin < Dylan::Plugin
  pattern(%r{^/([a-zA-Z0-9]{8})$})

  def call(host, path, request)
    match = path.match(%r{^/([a-zA-Z0-9]{8})$})
    code = match[1]

    Dylan::Response.redirect("x-devonthink://search?query=#{code}")
  end
end
