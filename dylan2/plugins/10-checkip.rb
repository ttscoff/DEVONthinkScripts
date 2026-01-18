# frozen_string_literal: true

# CheckIP Plugin - IPv4 und IPv6
# Emuliert Synology CheckIP Service

class CheckIPPlugin < Dylan::Plugin
  pattern(/checkip.*\.synology\.com/)

  IPV4_ADDRESS = "100.108.56.219"
  IPV6_ADDRESS = "2a00:6020:1000:a0::1da1"

  def call(host, path, request)
    # IPv6 Check
    if host.include?('checkipv6')
      body = "Current IP Address: #{IPV6_ADDRESS}"
    else
      # Default: IPv4
      body = "Current IP Address: #{IPV4_ADDRESS}"
    end

    Dylan::Response.text(body)
  end
end
