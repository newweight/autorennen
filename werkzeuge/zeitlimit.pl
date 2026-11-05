#!/usr/bin/perl
# werkzeuge/zeitlimit.pl SEKUNDEN befehl [args…]  – portabler Ersatz für GNU timeout (läuft auch auf macOS ohne coreutils).
# Startet den Befehl in eigener Prozessgruppe; nach Ablauf TERM, nach 5 s KILL an die ganze Gruppe; Exit 124 bei Zeitüberschreitung, sonst Exit-Code des Befehls.
use strict; use warnings; use POSIX ();
my $sek = shift @ARGV; die "Aufruf: zeitlimit.pl SEKUNDEN befehl…\n" unless defined $sek && @ARGV;
my $pid = fork(); die "fork: $!" unless defined $pid;
if ($pid == 0) { POSIX::setpgid(0, 0); exec @ARGV or do { print STDERR "exec: $!\n"; POSIX::_exit(127); } }
my $abgelaufen = 0;
$SIG{ALRM} = sub { $abgelaufen = 1; kill 'TERM', -$pid; };
alarm($sek);
my $w;
while (1) {
  $w = waitpid($pid, 0);
  last if $w == $pid;
  if ($w == -1 && $abgelaufen) { last }
}
alarm(0);
if ($abgelaufen) { sleep 1; kill 'KILL', -$pid; print STDERR "ZEITLIMIT: nach $sek s abgebrochen\n"; exit 124; }
exit(($? & 127) ? 128 + ($? & 127) : ($? >> 8));
