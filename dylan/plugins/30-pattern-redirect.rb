# frozen_string_literal: true

# Pattern Redirect Plugin
# Replaces YOURLS for dynamic pattern-based redirects
#
# Patterns:
#   /n/SEARCH_TERM → Apple Shortcuts (Notes search)
#   /XXXXXXXX (8 characters) → DEVONthink search

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
