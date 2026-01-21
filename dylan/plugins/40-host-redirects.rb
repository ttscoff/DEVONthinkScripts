# frozen_string_literal: true

require 'yaml'

# Host-based Redirects Plugin
# Reverse Proxy functionality based on hostname
#
# Matches requests by hostname (e.g., syncthing.mi.lan)
# Proxies/redirects to target server with path preserved

class HostRedirectsPlugin < Dylan::Plugin
  # No class-level pattern! We check dynamically against YAML
  pattern(/.^/)  # Matches nothing (we override match?)

  CONFIG_PATH = File.join(__dir__, '..', 'config', 'host-redirects.yaml')

  def initialize
    super
    @config_mtime = nil
    @redirects = load_redirects
    puts "    Loaded #{@redirects.count} host-based redirect(s) from YAML"
  end

  # Override match? for hostname patterns
  def match?(host, path)
    # Quick check: any redirects configured?
    return false if @redirects.empty?

    # Only reload if we have potential matches
    reload_if_changed

    @redirects.any? { |r| host.match?(r[:pattern]) }
  end

  def call(host, path, request)
    @redirects.each do |redirect|
      if match = host.match(redirect[:pattern])
        # Replace ${1}, ${2}, etc. with capture groups from host
        target = redirect[:target].dup
        match.captures.each_with_index do |capture, index|
          target.gsub!("${#{index + 1}}", capture.to_s)
        end

        # Append the path if it's not just "/"
        target += path unless path == '/'

        return Dylan::Response.redirect(target)
      end
    end

    nil  # No match
  end

  private

  def reload_if_changed
    return unless File.exist?(CONFIG_PATH)

    current_mtime = File.mtime(CONFIG_PATH)

    if @config_mtime.nil? || current_mtime > @config_mtime
      @config_mtime = current_mtime
      @redirects = load_redirects
      puts "🔄 Reloaded host-redirects.yaml (#{@redirects.count} redirects)" if @config_mtime
    end
  end

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
    puts "WARNING: Could not load host-redirects.yaml: #{e.message}"
    []
  end
end
