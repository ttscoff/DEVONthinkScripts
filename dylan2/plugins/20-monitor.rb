# frozen_string_literal: true

# Monitor Plugin - Netzwerk-Host-Überwachung
# Liest HTML-Datei die vom Bash-Script generiert wird

class MonitorPlugin < Dylan::Plugin
  pattern(%r{^/(monitor|monitor\.html)$})

  MONITOR_HTML_PATH = '/app/data/monitor.html'

  def call(host, path, request)
    if File.exist?(MONITOR_HTML_PATH)
      html_content = File.read(MONITOR_HTML_PATH)
      Dylan::Response.html(html_content)
    else
      Dylan::Response.error(404, "Monitor nicht verfügbar - HTML-Datei nicht gefunden")
    end
  end
end
