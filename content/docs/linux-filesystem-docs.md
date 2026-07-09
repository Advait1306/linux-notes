---
title: Understand the Linux filesystem
navLabel: Linux Filesystem
description: "Learn the Linux filesystem as an operating-system subsystem: paths, inodes, dentries, mounts, hierarchy, file types, permissions, virtual filesystems, storage, and VFS internals."
contentType: Conceptual
lastReviewed: 2026-07-09
---
## Understand the Linux filesystem

The Linux filesystem is the layer that turns names like `/etc/ssh/sshd_config` into kernel objects, permissions checks, cached pages, device I/O, and sometimes synthetic data that does not live on a disk at all.

Use this section as the filesystem chapter of a Linux operating-system index. It explains what exists, how the pieces fit, and what order to learn them in.

## The model

Linux presents files as one tree rooted at `/`. That tree is not one disk. It is a namespace assembled from mounted filesystems.

At runtime, a pathname crosses several layers:

```md
process
  -> file descriptor table
  -> system call
  -> Virtual File System (VFS)
  -> dentry and inode caches
  -> mounted filesystem implementation
  -> page cache
  -> block layer or network client
  -> device, server, or kernel-generated data
```

The most important distinction is this:

- **Path**: a string used to find something
- **Dentry**: a cached directory entry that connects a name to an inode
- **Inode**: the filesystem object and its metadata
- **File object**: an open handle with flags, offset, and operations
- **File descriptor**: the process-local integer that refers to an open file object
- **Superblock**: the kernel object for a mounted filesystem instance
- **Mount**: the connection between a filesystem tree and a path in a namespace

If you understand those seven objects, the rest of the Linux filesystem becomes much easier to place.

## The single tree

Linux processes see a root directory. For most processes, that root is `/`. For a process in a container, chroot, or custom mount namespace, `/` may be a different root.

The tree is single from the process point of view:

```text
/
|-- etc
|-- home
|-- proc
|-- run
|-- sys
|-- usr
`-- var
```

The backing filesystems can be different:

```text
/              ext4, XFS, Btrfs, or another root filesystem
/boot          often a separate filesystem
/home          often a separate filesystem
/proc          procfs
/sys           sysfs
/dev           devtmpfs plus udev-managed entries
/run           tmpfs
/var/lib/app   bind mount, volume, or network filesystem
```

The path does not tell you the filesystem type. Use `findmnt`, `stat -f`, or `/proc/self/mountinfo` to see that.

## Paths and lookup

A pathname is input to a lookup algorithm. The kernel resolves it one component at a time.

For `/usr/bin/env`, the components are:

```text
/
usr
bin
env
```

Lookup starts from:

- **`/`**: for absolute paths
- **Current working directory**: for relative paths
- **A directory file descriptor**: for `openat`-style system calls
- **A custom root**: for `chroot` or constrained `openat2` resolution

During lookup, Linux checks:

- **Search permission**: execute permission on each directory in the path
- **Component type**: non-final components must resolve to directories, unless they are symlinks that lead to directories
- **Symlink limits**: too many symbolic links returns `ELOOP`
- **Mount points**: a component can cross from one mounted filesystem to another
- **Namespace root**: `..` cannot escape the process root

Good to know:

- A filename is not stored inside the inode as the file's identity
- A directory maps names to inode references
- Multiple names can point to the same inode through hard links
- A pathname can become stale while you are using it
- An open file descriptor can remain valid after the path is renamed or removed

## VFS objects

The Virtual File System (VFS) is the kernel layer that gives user space one filesystem interface. Calls such as `open`, `read`, `write`, `stat`, `chmod`, `rename`, and `unlink` enter VFS code before reaching ext4, XFS, Btrfs, tmpfs, NFS, or another filesystem.

| Object | Lives in | Purpose |
| --- | --- | --- |
| `struct file_system_type` | Kernel memory | Describes a filesystem driver such as ext4, xfs, tmpfs, proc, or overlay |
| `struct super_block` | Kernel memory | Represents a mounted filesystem instance |
| `struct inode` | Kernel memory, often backed by disk metadata | Represents a file, directory, device node, symlink, FIFO, or socket |
| `struct dentry` | Kernel memory | Caches a name-to-inode relationship |
| `struct file` | Kernel memory | Represents an open file description |
| File descriptor | Process table | Integer handle used by user-space programs |
| Page cache entries | Kernel memory | Cache file contents and dirty writes |

The VFS has two jobs:

- **Common behavior**: path lookup, permission checks, file descriptor handling, caching, mount traversal
- **Dispatch**: call filesystem-specific operations when the backing filesystem must decide or perform work

For example, `stat("/etc/passwd")` can often complete mostly from VFS caches. A cache miss asks the backing filesystem to look up the missing component.

## File types

Linux filesystems expose several file types. The type is part of inode metadata.

| Type | Example | What it means |
| --- | --- | --- |
| Regular file | `/etc/hostname` | Byte stream with file data |
| Directory | `/usr/bin` | Mapping from names to filesystem objects |
| Symbolic link | `/bin -> /usr/bin` | Small file whose contents are another path |
| Block device | `/dev/nvme0n1` | Device node for block-oriented I/O |
| Character device | `/dev/null` | Device node for stream-like device I/O |
| FIFO | Named pipe | IPC endpoint in the filesystem namespace |
| Socket | Unix domain socket | IPC endpoint that can be addressed by pathname |

Directories are not folders in the abstract. They are filesystem objects with entries. Each entry binds a name to another object.

## The directory hierarchy

The hierarchy is a convention, not the kernel's core filesystem design. The kernel cares about mounted trees and pathnames. Distributions arrange paths according to the Filesystem Hierarchy Standard (FHS), systemd conventions, package manager policy, and their own history.

| Path | Purpose | Learn it as |
| --- | --- | --- |
| `/` | Root of the process-visible tree | The anchor for absolute paths |
| `/bin` | Essential command binaries, often symlinked to `/usr/bin` | Compatibility path on merged-`/usr` systems |
| `/sbin` | Essential system binaries, often symlinked to `/usr/sbin` | Compatibility path |
| `/boot` | Boot loader files, kernel images, initramfs | Early boot assets |
| `/dev` | Device nodes | Kernel devices exposed as files |
| `/etc` | Host-specific configuration | Machine-local text configuration |
| `/home` | User home directories | Human-owned data |
| `/lib`, `/lib64` | Essential libraries, often symlinked into `/usr` | Compatibility paths for loaders and libraries |
| `/media` | Removable media mount points | Desktop-managed mounts |
| `/mnt` | Temporary manual mount point | Administrator workspace |
| `/opt` | Add-on software packages | Vendor or self-contained applications |
| `/proc` | Kernel and process information | procfs, synthetic runtime data |
| `/root` | Root user's home directory | Admin home |
| `/run` | Runtime state since boot | tmpfs, cleared on reboot |
| `/srv` | Data served by this machine | Site-specific service data |
| `/sys` | Kernel object model | sysfs, devices, drivers, buses |
| `/tmp` | Temporary files | Often tmpfs or cleaned by policy |
| `/usr` | Shareable, mostly static OS and application files | Installed software and read-only system content |
| `/usr/local` | Locally installed software | Admin-managed software outside the package manager |
| `/var` | Variable state | Logs, caches, spools, databases, package state |

Modern distributions often use a merged `/usr` layout where `/bin`, `/sbin`, `/lib`, and `/lib64` are symlinks into `/usr`.

## Metadata

The inode stores or represents file metadata. User-space programs read this through `stat` or `statx`.

Important fields:

- **Device ID**: which filesystem device the inode belongs to
- **Inode number**: unique within one filesystem
- **Mode**: file type plus permission bits
- **Link count**: number of hard links
- **Owner and group**: numeric user ID and group ID
- **Size**: logical length in bytes
- **Blocks**: allocated storage, usually shown in 512-byte units
- **Access time**: last access time, subject to mount policy
- **Modification time**: last data modification time
- **Change time**: last inode metadata change time
- **Birth time**: creation time when the filesystem and API support it

Good to know:

- Size and allocated blocks can differ because of sparse files, compression, holes, or delayed allocation
- `ctime` is not creation time
- `btime` exists through `statx`, but support varies
- `/proc` and `/sys` files can report sizes that do not match readable content

## Permissions

Classic Unix permissions have three classes and three actions:

```text
owner: read write execute
group: read write execute
other: read write execute
```

For regular files:

- **Read**: read file contents
- **Write**: modify file contents
- **Execute**: execute the file as a program or script

For directories:

- **Read**: list names in the directory
- **Write**: create, delete, or rename entries, if execute is also present
- **Execute**: search or traverse the directory

Directory execute permission is the permission people most often misunderstand. Without it, you cannot resolve names inside the directory, even if you know the filename.

Special bits:

| Bit | Applies to | Meaning |
| --- | --- | --- |
| setuid | Executable files | Run with the file owner's effective user ID |
| setgid | Executable files | Run with the file group's effective group ID |
| setgid | Directories | New entries inherit the directory group |
| sticky | Directories | Only file owner, directory owner, or privileged process can delete or rename entries |

Extended mechanisms:

- **ACLs**: add more specific user and group permission entries
- **xattrs**: store name-value metadata outside ordinary file data
- **File capabilities**: grant selected privileges to executables without full setuid root
- **LSM labels**: SELinux, AppArmor, and other Linux Security Modules can add policy decisions beyond mode bits
- **Idmapped mounts**: map ownership differently at a mount boundary

## Links

Linux has hard links and symbolic links. They solve different problems.

| Link type | Points to | Can cross filesystems | Breaks if target path is removed | Shares inode |
| --- | --- | --- | --- | --- |
| Hard link | Inode | No | No | Yes |
| Symbolic link | Path string | Yes | Yes | No |

A hard link creates another directory entry for the same inode. There is no original name at the filesystem level.

A symbolic link is its own inode. Its data is a path string. The kernel follows that string during path lookup unless the operation says not to follow symlinks.

Good to know:

- Hard links usually cannot be made to directories by ordinary users
- Hard links cannot cross filesystem boundaries
- Removing one hard link decrements the link count
- The data is removed when the last link and last open reference are gone
- Symlinks can point to paths that do not exist

## Mounts

A mount attaches a filesystem tree to a path in the process's mount namespace.

The command shape is:

```bash
mount -t filesystem_type -o options source target
```

Examples:

```bash
mount -t ext4 /dev/nvme0n1p2 /mnt/root
mount -t tmpfs -o size=512M tmpfs /run/build
mount --bind /srv/app/uploads /var/www/uploads
```

The target directory becomes the visible entry point for the mounted filesystem. The original contents of the target directory are hidden until the mount is removed.

Mount concepts:

- **Source**: device, server export, pseudo source, or another path
- **Target**: directory where the filesystem appears
- **Filesystem type**: ext4, xfs, btrfs, tmpfs, proc, sysfs, nfs, cifs, overlay, and others
- **Mount options**: behavior such as read-only, noexec, nosuid, nodev, relatime, size, compression, discard
- **Bind mount**: another view of an existing tree
- **Recursive bind mount**: bind mount including submounts
- **Move mount**: move a mount to another target
- **Mount namespace**: per-process view of the mount tree
- **Propagation**: controls whether mount and unmount events spread between related mounts

Persistent mounts usually live in `/etc/fstab`, but systemd can also generate or consume `.mount` and `.automount` units.

## Virtual filesystems

Not every filesystem stores data on a disk. Some filesystems are kernel interfaces.

| Filesystem | Usual mount | Purpose |
| --- | --- | --- |
| procfs | `/proc` | Process and kernel information |
| sysfs | `/sys` | Kernel object model, devices, drivers, buses |
| devtmpfs | `/dev` | Device nodes created by the kernel |
| tmpfs | `/run`, often `/tmp` | Memory-backed files with optional swap backing |
| cgroup2 | `/sys/fs/cgroup` | Resource control hierarchy |
| securityfs | `/sys/kernel/security` | Security module interface |
| debugfs | `/sys/kernel/debug` | Debug interface, usually not for stable tooling |
| tracefs | `/sys/kernel/tracing` | Kernel tracing interface |

Do not learn `/proc` and `/sys` as normal directories. They are APIs exposed through filesystem semantics.

Rules of thumb:

- `/proc/<pid>` describes one process
- `/proc/self` refers to the calling process
- `/proc/sys` exposes sysctl settings
- `/sys/class` groups devices by functional class
- `/sys/devices` follows the kernel's device tree
- `/dev` contains device nodes, but user-space tools such as udev usually add permissions and stable symlinks
- `/run` is runtime state and disappears across reboot

## Local filesystems

Local filesystems store data on local block devices or layered block devices.

| Filesystem | Best mental model | Common use |
| --- | --- | --- |
| ext4 | Conservative journaling filesystem | General-purpose Linux systems |
| XFS | High-scale journaling filesystem | Large files, large filesystems, enterprise Linux |
| Btrfs | Copy-on-write filesystem with subvolumes and snapshots | Snapshots, send/receive, checksumming, multi-device features |
| FAT/exFAT | Compatibility filesystems | Removable media and cross-platform exchange |
| ISO 9660/UDF | Optical media formats | Images, installers, read-mostly media |

ext4, XFS, and Btrfs are not just storage formats. They implement VFS operations, allocation policy, metadata persistence, recovery behavior, mount options, and tooling.

Comparison:

| Feature | ext4 | XFS | Btrfs |
| --- | --- | --- | --- |
| Metadata journaling | Yes | Yes | Copy-on-write metadata |
| Online grow | Yes | Yes | Yes |
| Online shrink | No | No | Yes, with caveats |
| Snapshots | No native snapshots | No native snapshots | Native subvolume snapshots |
| Checksumming data | No | Metadata focused | Metadata and data checksums |
| Send/receive | No | No | Yes |
| Typical default | Debian/Ubuntu-style systems | RHEL-style systems | Some desktop and snapshot-focused systems |

Use distribution docs for production defaults. The kernel supports a wide range of filesystems, but distributions choose a smaller supported set.

## Network and shared filesystems

Network filesystems use the VFS interface locally and a remote protocol underneath.

| Filesystem | Protocol family | Common use |
| --- | --- | --- |
| NFS | Unix/Linux network file sharing | Home directories, shared application data, clusters |
| SMB/CIFS | Windows-compatible file sharing | Enterprise shares, mixed OS environments |
| SSHFS | SFTP-based user-space filesystem | Convenience mounts, not high-performance storage |
| CephFS | Distributed filesystem | Clustered and cloud storage |
| GFS2, OCFS2 | Shared-disk clustered filesystems | Multiple machines accessing shared block storage |

Network filesystems can have different consistency and caching rules from local filesystems. A path lookup or permission check may require server communication. That is why VFS lookup has cache revalidation paths and why stale handles exist.

## Overlay filesystems

Overlay filesystems combine multiple directory trees into one visible tree.

The common container model is:

```text
merged view
  -> upper layer: writable container changes
  -> lower layers: read-only image layers
  -> workdir: overlayfs bookkeeping
```

Overlayfs is why a container can appear to have a full root filesystem while only storing the changes made by that container.

Important ideas:

- **Lower layer**: read-only source tree
- **Upper layer**: writable tree that records changes
- **Merged directory**: combined view presented to processes
- **Copy up**: copying a lower object into the upper layer before modification
- **Whiteout**: marker that hides a lower-layer file that was deleted in the merged view

Overlay behavior matters for build systems, package managers, container volumes, and file watching.

## The storage path

When a regular file is backed by local storage, I/O moves through several layers:

```text
application
  -> libc wrapper
  -> syscall
  -> VFS
  -> filesystem implementation
  -> page cache
  -> block layer
  -> device mapper, LVM, encryption, RAID, or partition layer
  -> driver
  -> storage device
```

Not every operation reaches the device:

- A cached read can return from RAM
- A buffered write can dirty page cache and return before device writeback
- `fsync` asks the filesystem to commit the relevant data and metadata
- Direct I/O can bypass the page cache for some workloads
- Memory-mapped I/O uses the virtual memory subsystem and page cache together

The filesystem is not the same as the disk:

- A disk has sectors or logical blocks
- A partition selects a region of a disk
- A block device exposes block I/O
- A filesystem organizes names, metadata, and file data on top
- A mount makes that filesystem visible in a namespace

## What common operations do

### Open a file

`open("/etc/hostname", O_RDONLY)` performs a path lookup, checks permissions, creates a `struct file`, installs a file descriptor in the process, and returns the descriptor number.

If the path is later renamed, the open descriptor still refers to the same open file description.

### Read a file

`read(fd, buffer, size)` uses the file descriptor to find the open file object. The VFS calls the file's read operation. The filesystem and page cache provide data. A cache miss can trigger I/O.

### Write a file

`write(fd, buffer, size)` usually copies data into the page cache, marks pages dirty, updates metadata, and schedules writeback. The call returning does not always mean the data is durable on storage.

### Rename a file

`rename(old, new)` updates directory entries. On the same mounted filesystem, rename is designed to be atomic from the namespace point of view. Across filesystems, rename fails with `EXDEV`; tools must copy and unlink instead.

### Unlink a file

`unlink(path)` removes a directory entry. If other hard links exist, the inode remains. If a process has the file open, the inode and data remain until the last open reference closes.

### Make a directory

`mkdir(path, mode)` creates a directory inode and inserts entries for `.` and `..`, with filesystem-specific details underneath.

### Mount a filesystem

`mount(source, target, type, flags, data)` constructs or finds a superblock, creates a mount object, and attaches it to a target path in the caller's mount namespace.

## Durability

Filesystem durability is about what survives a crash.

The main layers are:

- **Application buffer**: data in process memory
- **Kernel page cache**: data accepted by the kernel but not necessarily on storage
- **Filesystem journal or CoW metadata**: metadata consistency mechanism
- **Device cache**: drive or controller cache
- **Stable storage**: data persisted across power loss, assuming hardware honors flushes

Important operations:

| Operation | What it asks for |
| --- | --- |
| `write` | Accept bytes into the kernel path |
| `fsync(file_fd)` | Persist file data and required metadata |
| `fdatasync(file_fd)` | Persist file data and minimal metadata |
| `sync` | Schedule broad system-wide writeback |
| `rename` | Atomically change a name within one filesystem |
| `fsync(directory_fd)` | Persist directory entry changes on filesystems where this matters |

Crash-safe update pattern:

```text
write new data to temporary file
fsync temporary file
rename temporary file over old file
fsync containing directory
```

The exact guarantees depend on the filesystem, mount options, storage hardware, and whether the application calls the right synchronization operations.

## Common errors

Filesystem errors are part of the API. Learn the common ones as a map of where lookup or I/O failed.

| Error | Meaning |
| --- | --- |
| `ENOENT` | A path component or final file does not exist |
| `EACCES` | Permission denied |
| `EPERM` | Operation not permitted, often policy or capability related |
| `ENOTDIR` | A non-final path component is not a directory |
| `EISDIR` | Operation expected a non-directory but got a directory |
| `ELOOP` | Too many symlink resolutions |
| `EXDEV` | Operation cannot cross filesystem boundaries |
| `EBUSY` | Resource is busy, often mount or open-file related |
| `EROFS` | Filesystem is read-only |
| `ENOSPC` | No space left on device |
| `EDQUOT` | Quota exceeded |
| `ESTALE` | Stale file handle, often network filesystem related |
| `EINVAL` | Invalid argument or unsupported option combination |

## Inspection map

Use these commands to attach concepts to a running system.

| Question | Command |
| --- | --- |
| What filesystem type backs this path? | `stat -f -c '%T' /path` |
| What inode and metadata does this file have? | `stat /path` |
| What mounted filesystems can this process see? | `findmnt` |
| What is the kernel's mount view? | `cat /proc/self/mountinfo` |
| What block devices exist? | `lsblk -f` |
| What filesystems does this kernel know? | `cat /proc/filesystems` |
| What process has this file open? | `lsof /path` |
| What system calls does this command make? | `strace -e trace=file command` |
| What disk usage is allocated under a tree? | `du -h -d 1 /path` |
| What free space does each filesystem report? | `df -hT` |
| What are the persistent filesystem IDs? | `blkid` |
| What changed under this directory? | `inotifywait` or `fanotify` tools |

Commands are observation tools. The model is still VFS objects, mounted filesystems, and storage layers.

## Source map

Use these sources as the canonical map behind this section.

### Style sources

- [Vercel writing guidelines](https://github.com/vercel-labs/writing-guidelines): public guidance on short summaries, direct address, content types, heading style, examples, and reference structure
- [Vercel Project Configuration docs](https://vercel.com/docs/project-configuration): current example of Vercel docs page structure
- [Vercel Build Output API docs](https://vercel.com/docs/build-output-api): current example of file-structure reference docs
- [Vercel Agent-Friendly Docs](https://vercel.com/academy/agent-friendly-apis/agent-friendly-docs): current guidance on scannable, agent-readable documentation

### Linux user-space interface sources

- [Linux man-pages: inode(7)](https://man7.org/linux/man-pages/man7/inode.7.html)
- [Linux man-pages: path_resolution(7)](https://man7.org/linux/man-pages/man7/path_resolution.7.html)
- [Linux man-pages: open(2)](https://man7.org/linux/man-pages/man2/open.2.html)
- [Linux man-pages: mount(8)](https://man7.org/linux/man-pages/man8/mount.8.html)
- [Linux man-pages: fstab(5)](https://man7.org/linux/man-pages/man5/fstab.5.html)
- [Linux man-pages: mount_namespaces(7)](https://man7.org/linux/man-pages/man7/mount_namespaces.7.html)
- [Linux man-pages: sysfs(5)](https://man7.org/linux/man-pages/man5/sysfs.5.html)
- [Linux man-pages: tmpfs(5)](https://man7.org/linux/man-pages/man5/tmpfs.5.html)

### Linux kernel documentation sources

- [Filesystems in the Linux kernel](https://docs.kernel.org/filesystems/index.html)
- [Overview of the Linux Virtual File System](https://docs.kernel.org/filesystems/vfs.html)
- [Pathname lookup](https://docs.kernel.org/filesystems/path-lookup.html)
- [Filesystem Mount API](https://docs.kernel.org/filesystems/mount_api.html)
- [The /proc filesystem](https://docs.kernel.org/filesystems/proc.html)
- [sysfs](https://docs.kernel.org/filesystems/sysfs.html)
- [Overlay filesystem](https://docs.kernel.org/filesystems/overlayfs.html)
- [ext4 data structures and algorithms](https://docs.kernel.org/filesystems/ext4/)
- [XFS filesystem documentation](https://docs.kernel.org/filesystems/xfs/index.html)

### Linux kernel source entry points

- [torvalds/linux: fs/open.c](https://github.com/torvalds/linux/blob/master/fs/open.c)
- [torvalds/linux: fs/namei.c](https://github.com/torvalds/linux/blob/master/fs/namei.c)
- [torvalds/linux: fs/namespace.c](https://github.com/torvalds/linux/blob/master/fs/namespace.c)
- [torvalds/linux: fs/super.c](https://github.com/torvalds/linux/blob/master/fs/super.c)
- [torvalds/linux: include/linux/fs.h](https://github.com/torvalds/linux/blob/master/include/linux/fs.h)
- [torvalds/linux: fs/ext4](https://github.com/torvalds/linux/tree/master/fs/ext4)
- [torvalds/linux: fs/xfs](https://github.com/torvalds/linux/tree/master/fs/xfs)
- [torvalds/linux: fs/overlayfs](https://github.com/torvalds/linux/tree/master/fs/overlayfs)
- [torvalds/linux: fs/proc](https://github.com/torvalds/linux/tree/master/fs/proc)

### Hierarchy and administration sources

- [Filesystem Hierarchy Standard, Version 3.0](https://specifications.freedesktop.org/fhs/latest/)
- [systemd file hierarchy manual](https://man7.org/linux/man-pages/man7/file-hierarchy.7.html)
- [Red Hat Enterprise Linux 10: Managing file systems](https://docs.redhat.com/en/documentation/red_hat_enterprise_linux/10/html/managing_file_systems/index)
- [Btrfs documentation](https://btrfs.readthedocs.io/en/latest/)
