class Ireview < Formula
  desc "Browser-based local diff review for AI-generated changes"
  homepage "https://github.com/suhothayan/iReview"
  version "0.1.0"
  license "MIT"

  on_macos do
    on_arm do
      url "https://github.com/suhothayan/iReview/releases/download/v0.1.0/ireview-macos-arm64"
      sha256 "0552d8532fb6a3f51ae3981b16512e374223cbe0fd601e71a7b820b8d6a4c05c"
    end
    on_intel do
      url "https://github.com/suhothayan/iReview/releases/download/v0.1.0/ireview-macos-x64"
      sha256 "0103121acb12746f7a6f9f5f09cfb05996592de0544e5ca7cb2d62b8101d3a07"
    end
  end

  on_linux do
    on_intel do
      url "https://github.com/suhothayan/iReview/releases/download/v0.1.0/ireview-linux-x64"
      sha256 "a3ec97341362972eda71e9d7b6d855436e2f987dd4a2aa051ca1e400fa4cabe3"
    end
  end

  depends_on "git"

  def install
    binary = if OS.mac? && Hardware::CPU.arm?
               "ireview-macos-arm64"
             elsif OS.mac?
               "ireview-macos-x64"
             else
               "ireview-linux-x64"
             end
    bin.install binary => "ireview"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/ireview --version")
  end
end
