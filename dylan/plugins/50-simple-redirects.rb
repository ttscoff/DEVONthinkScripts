# frozen_string_literal: true

require 'yaml'

# Simple Redirects Plugin
# Lädt Redirects aus YAML-Datei - kein Ruby-Code nötig!
#
# User können einfach config/redirects.yaml editieren

class SimpleRedirectsPlugin < Dylan::Plugin
  # Kein class-level Pattern! Wir checken dynamisch gegen YAML
  pattern(/.^/)  # Matches nothing (wir überschreiben match?)

  CONFIG_PATH = File.join(__dir__, '..', 'config', 'redirects.yaml')

  def initialize
    super
    @redirects = load_redirects
    puts "    Loaded #{@redirects.count} simple redirect(s) from YAML"
  end

  # Überschreibe match? für dynamische Patterns
  def match?(host, path)
    @redirects.any? { |r| path.match?(r[:pattern]) }
  end

  def call(host, path, request)
    @redirects.each do |redirect|
      if match = path.match(redirect[:pattern])
        # Ersetze ${1}, ${2}, etc. mit Capture-Groups
        target = redirect[:target].dup
        match.captures.each_with_index do |capture, index|
          target.gsub!("${#{index + 1}}", capture.to_s)
        end

        return Dylan::Response.redirect(target)
      end
    end

    nil  # Kein Match
  end

  private

  def load_redirects
    return [] unless File.exist?(CONFIG_PATH)

    data = YAML.load_file(CONFIG_PATH)
    data['redirects'].map do |r|
      {
        pattern: Regexp.new(r['pattern']),
        target: r['target'],
        description: r['description']
      }
    end
  rescue => e
    puts "WARNING: Could not load redirects.yaml: #{e.message}"
    []
  end
end
